import pandas as pd
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from .models import KoboSubmission, TargetShop
from .serializers import KoboSubmissionSerializer, TargetShopSerializer
from django.shortcuts import render
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from datetime import datetime
from django.utils.dateparse import parse_datetime, parse_date
import os
from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.decorators import api_view
import requests
from django.utils import timezone


def sync_kobo_data(request):
    # 1. Fetch credentials from Django settings (Render Environment Variables)
    server_url = settings.KOBO_SERVER_URL
    api_key = settings.KOBO_API_KEY
    asset_uid = settings.KOBO_ASSET_UID

    if not all([server_url, api_key, asset_uid]):
        return JsonResponse({"error": "Missing Kobo credentials. Check Environment Variables."}, status=400)

    url = f"{server_url}/api/v2/assets/{asset_uid}/data/?format=json"
    headers = {"Authorization": f"Token {api_key}"}

    total_saved = 0
    total_updated = 0
    total_skipped = 0
    batch_size = 100  # Process in chunks to prevent memory crash

    # 2. Loop through paginated data
    while url:
        try:
            # Added timeout=30 to prevent the server from hanging
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            return JsonResponse({"error": f"Kobo Error: {str(e)}"}, status=500)

        results = data.get('results', [])
        batch_to_create = []
        batch_to_update = []

        # Fetch existing IDs for this batch to determine update vs create
        uuids_in_page = [r.get('_uuid') for r in results if r.get('_uuid')]
        existing_objects = KoboSubmission.objects.filter(kobo_id__in=uuids_in_page)
        existing_dict = {obj.kobo_id: obj for obj in existing_objects}

        for record in results:
            kobo_id = record.get('_uuid')

            # Clean the string fields so they don't crash the database
            stall_id = str(record.get('X1', '')).strip()
            date_str = record.get('X4')
            date_of_assessment = parse_date(date_str) if date_str else None

            # SKIP BROKEN RECORDS: If there is no Stall ID or no Date, skip it.
            if not stall_id or not date_of_assessment:
                total_skipped += 1
                continue

            # Safe geolocation parsing
            geolocation = record.get('_geolocation')
            lat, lon = None, None
            if geolocation and isinstance(geolocation, list) and len(geolocation) >= 2:
                try:
                    lat = float(geolocation[0]) if geolocation[0] is not None else None
                    lon = float(geolocation[1]) if geolocation[1] is not None else None
                except (ValueError, TypeError):
                    pass

            # Safe time parsing
            submission_time_str = record.get('_submission_time')
            submission_time = timezone.now()
            if submission_time_str:
                try:
                    parsed_time = parse_datetime(submission_time_str)
                    if parsed_time:
                        submission_time = parsed_time
                        if timezone.is_naive(submission_time):
                            submission_time = timezone.make_aware(submission_time)
                except Exception:
                    pass

            # Prepare the fields
            defaults = {
                'stall_id': stall_id,
                'zonal_officer': str(record.get('X3', '')),
                'date_of_assessment': date_of_assessment,
                'enumerator_id': str(record.get('enumerator') or record.get('enumerator_id', '')),
                'owner_name': str(record.get('X12', '')),
                'owner_mobile': str(record.get('X13', '')),
                'shop_name': str(record.get('X10', '')),
                'shop_address': str(record.get('X16', '')),
                'risk_level': str(record.get('final_class', '')),
                'latitude': lat,
                'longitude': lon,
                'submission_time': submission_time,
            }

            # Sort into update or create batches
            if kobo_id in existing_dict:
                obj = existing_dict[kobo_id]
                for key, value in defaults.items():
                    setattr(obj, key, value)
                batch_to_update.append(obj)
                total_updated += 1
            else:
                batch_to_create.append(KoboSubmission(kobo_id=kobo_id, **defaults))
                total_saved += 1

        # Execute database writes in bulk to save memory
        if batch_to_create:
            KoboSubmission.objects.bulk_create(batch_to_create, ignore_conflicts=True)
        if batch_to_update:
            KoboSubmission.objects.bulk_update(batch_to_update, fields=list(defaults.keys()))

        # Clear memory for the next loop
        batch_to_create.clear()
        batch_to_update.clear()

        # Move to next page
        url = data.get('next')

    return JsonResponse({
        "status": "success",
        "message": "Sync complete!",
        "created": total_saved,
        "updated": total_updated,
        "skipped": total_skipped
    }, status=200)


@csrf_exempt
@require_POST
def kobo_webhook(request):
    """
    Receives live POST data from KoboToolbox REST Services
    """
    try:
        payload = json.loads(request.body)
        kobo_id = payload.get('_uuid')

        if not kobo_id:
            return JsonResponse({"status": "error", "message": "No _uuid found"}, status=400)

        # --- EXACT FIELD MAPPING (Same as your sync function) ---
        stall_id = str(payload.get('X1', '')).strip()
        date_str = payload.get('X4')
        date_of_assessment = parse_date(date_str) if date_str else None

        # SKIP BROKEN RECORDS
        if not stall_id or not date_of_assessment:
            return JsonResponse({"status": "skipped", "message": "Missing X1 or X4"}, status=200)

        enumerator_id = str(payload.get('enumerator') or payload.get('enumerator_id', ''))
        zonal_officer = str(payload.get('X3', ''))
        shop_name = str(payload.get('X10', ''))
        owner_name = str(payload.get('X12', ''))
        owner_mobile = str(payload.get('X13', ''))
        shop_address = str(payload.get('X16', ''))
        risk_level = str(payload.get('final_class', ''))

        # Geolocation
        geolocation = payload.get('_geolocation')
        lat, lon = None, None
        if geolocation and isinstance(geolocation, list) and len(geolocation) >= 2:
            try:
                lat = float(geolocation[0]) if geolocation[0] is not None else None
                lon = float(geolocation[1]) if geolocation[1] is not None else None
            except (ValueError, TypeError):
                pass

        # Submission Time
        submission_time_str = payload.get('_submission_time')
        submission_time = timezone.now()
        if submission_time_str:
            try:
                parsed_time = parse_datetime(submission_time_str)
                if parsed_time:
                    submission_time = parsed_time
                    if timezone.is_naive(submission_time):
                        submission_time = timezone.make_aware(submission_time)
            except Exception:
                pass

        # Update or Create the record in Django DB
        submission, created = KoboSubmission.objects.update_or_create(
            kobo_id=kobo_id,
            defaults={
                'stall_id': stall_id,
                'zonal_officer': zonal_officer,
                'date_of_assessment': date_of_assessment,
                'enumerator_id': enumerator_id,
                'owner_name': owner_name,
                'owner_mobile': owner_mobile,
                'shop_name': shop_name,
                'shop_address': shop_address,
                'risk_level': risk_level,
                'latitude': lat,
                'longitude': lon,
                'submission_time': submission_time,
            }
        )

        status_text = "Created" if created else "Updated"
        return JsonResponse({"status": "success", "message": f"Submission {status_text}"}, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


class KoboSubmissionListView(generics.ListAPIView):
    queryset = KoboSubmission.objects.all().order_by('-submission_time')
    serializer_class = KoboSubmissionSerializer


class TargetShopListView(generics.ListAPIView):
    queryset = TargetShop.objects.all()
    serializer_class = TargetShopSerializer


class UploadTargetShopsView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=400)

        try:
            xls = pd.ExcelFile(file_obj)
            total_added = 0

            for sheet_name in xls.sheet_names:
                if sheet_name.lower() == 'summary':
                    continue

                df = pd.read_excel(xls, sheet_name=sheet_name)

                if 'Shop Name' not in df.columns or 'Latitude' not in df.columns:
                    continue

                for index, row in df.iterrows():
                    shop_name = str(row.get('Shop Name', '')).strip()
                    lat = row.get('Latitude')
                    lon = row.get('Longitude')

                    if shop_name and pd.notna(lat) and pd.notna(lon):
                        TargetShop.objects.update_or_create(
                            shop_name=shop_name,
                            defaults={
                                'zone': str(row.get('Zone', '')),
                                'circle': str(row.get('Circle', '')),
                                'ward_no': str(row.get('Ward No', '')),
                                'ward_name': str(row.get('Ward Name', '')),
                                'shop_type': str(row.get('Type of Shop', '')),
                                'address': str(row.get('Address', '')),
                                'latitude': float(lat),
                                'longitude': float(lon)
                            }
                        )
                        total_added += 1

            # Cross-reference with Kobo data
            kobo_shops = KoboSubmission.objects.exclude(shop_name__isnull=True).values_list('shop_name', flat=True)
            kobo_shops_lower = [str(s).strip().lower() for s in kobo_shops]

            completed_count = 0
            for target in TargetShop.objects.all():
                if target.shop_name.strip().lower() in kobo_shops_lower:
                    target.is_completed = True
                else:
                    target.is_completed = False
                target.save()
                if target.is_completed:
                    completed_count += 1

            total_targets = TargetShop.objects.count()

            return Response({
                "status": "success",
                "added": total_added,
                "total": total_targets,
                "completed": completed_count,
                "remaining": total_targets - completed_count
            })

        except Exception as e:
            return Response({"error": str(e)}, status=500)


def index(request):
    index_file_path = os.path.join(settings.REACT_BUILD_DIR, 'index.html')
    if os.path.exists(index_file_path):
        return FileResponse(open(index_file_path, 'rb'))
    else:
        raise Http404("React build not found.")