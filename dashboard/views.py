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


def index(request):
    return render(request, 'index.html')


def sync_kobo_data(request):
    # 1. Fetch credentials from Django settings
    server_url = settings.KOBO_SERVER_URL
    api_key = settings.KOBO_API_KEY
    asset_uid = settings.KOBO_ASSET_UID

    url = f"{server_url}/api/v2/assets/{asset_uid}/data/?format=json"
    headers = {"Authorization": f"Token {api_key}"}

    total_saved = 0
    total_updated = 0
    total_skipped = 0

    # 2. Loop through paginated data
    while url:
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()  # Catch HTTP errors
            data = response.json()
        except requests.exceptions.RequestException as e:
            return JsonResponse({"error": f"Failed to fetch data from Kobo: {str(e)}"}, status=500)

        results = data.get('results', [])

        # 3. Process each record with EXACT XLSForm field mappings
        for record in results:
            kobo_id = record.get('_uuid')

            # X1 = Stall ID
            stall_id = record.get('X1')

            # Date = X4
            date_str = record.get('X4')
            date_of_assessment = parse_date(date_str) if date_str else None

            # SKIP BROKEN RECORDS: If there is no Stall ID or no Date, don't save it.
            if not stall_id or not date_of_assessment:
                total_skipped += 1
                continue

            # enumerator_id = Enumerator
            enumerator_id = record.get('enumerator') or record.get('enumerator_id')

            # X3 = Zonal officer (supervisor)
            zonal_officer = record.get('X3')

            # X10 = Site / shop name
            shop_name = record.get('X10')

            # X12 = Owner name
            owner_name = record.get('X12')

            # X13 = Owner contact number
            owner_mobile = record.get('X13')

            # X16 = Shop address
            shop_address = record.get('X16')

            # final_class = Risk Level
            risk_level = record.get('final_class')

            # Geolocation (Kobo standard array)
            geolocation = record.get('_geolocation', [None, None])
            lat = geolocation[0] if len(geolocation) > 0 else None
            lon = geolocation[1] if len(geolocation) > 1 else None

            # Submission Time
            submission_time_str = record.get('_submission_time')
            submission_time = None
            if submission_time_str:
                submission_time = parse_datetime(submission_time_str)
                if submission_time and timezone.is_naive(submission_time):
                    submission_time = timezone.make_aware(submission_time)

            # 4. Save to Database
            obj, created = KoboSubmission.objects.update_or_create(
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

            if created:
                total_saved += 1
            else:
                total_updated += 1

        # Move to next page
        url = data.get('next')

    return JsonResponse({
        "status": "success",
        "message": "Sync complete!",
        "created": total_saved,
        "updated": total_updated,
        "skipped": total_skipped
    }, status=200)

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

        # Extract data (ensure these match your exact Kobo form field names)
        gps = payload.get('gps_field_name', [])  # Replace with actual field name
        lat = gps[0] if len(gps) > 0 else None
        lon = gps[1] if len(gps) > 1 else None

        # Parse the date and time safely
        raw_date = payload.get('date_of_assessment')
        raw_time = payload.get('_submission_time')

        date_assess = raw_date if raw_date else None
        sub_time = parse_datetime(raw_time) if raw_time else datetime.now()

        # Update or Create the record in Django DB
        submission, created = KoboSubmission.objects.update_or_create(
            kobo_id=kobo_id,
            defaults={
                'stall_id': payload.get('stall_id', ''),
                'shop_name': payload.get('shop_name', ''),
                'owner_name': payload.get('owner_name', ''),
                'owner_mobile': payload.get('owner_mobile', ''),
                'zonal_officer_name': payload.get('zonal_officer_name', ''),
                'submitted_by': payload.get('submitted_by', ''),
                'risk_level': payload.get('risk_level', ''),
                'date_of_assessment': date_assess,
                'latitude': lat,
                'longitude': lon,
                'submission_time': sub_time
            }
        )

        status_text = "Created" if created else "Updated"
        return JsonResponse({"status": "success", "message": f"Submission {status_text}"}, status=200)

    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Invalid JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def index(request):
    # Path to the React index.html
    index_file_path = os.path.join(settings.REACT_BUILD_DIR, 'index.html')

    if os.path.exists(index_file_path):
        return FileResponse(open(index_file_path, 'rb'))
    else:
        raise Http404("React build not found. Run 'npm run build' in the ghmc-frontend folder.")