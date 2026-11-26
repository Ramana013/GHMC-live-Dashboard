import requests
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils.dateparse import parse_datetime, parse_date
from django.utils import timezone
from dashboard.models import KoboSubmission


class Command(BaseCommand):
    help = 'Fetches data from Kobo API and saves to database using exact XLSForm names'

    def handle(self, *args, **kwargs):
        server_url = settings.KOBO_SERVER_URL
        api_key = settings.KOBO_API_KEY
        asset_uid = settings.KOBO_ASSET_UID

        url = f"{server_url}/api/v2/assets/{asset_uid}/data/?format=json"
        headers = {"Authorization": f"Token {api_key}"}

        total_saved = 0
        total_updated = 0

        while url:
            self.stdout.write(f"Fetching: {url}")
            response = requests.get(url, headers=headers)

            if response.status_code != 200:
                self.stdout.write(self.style.ERROR(f"Failed. Status: {response.status_code}"))
                break

            data = response.json()
            results = data.get('results', [])

            for record in results:
                kobo_id = record.get('_uuid')

                # --- EXACT FIELD MAPPING FROM YOUR XLSFORM 'NAME' COLUMN ---

                # X1 = Stall ID
                stall_id = record.get('X1')

                # Date = X4
                date_str = record.get('X4')
                date_of_assessment = parse_date(date_str) if date_str else None

                # SKIP BROKEN RECORDS: If there is no Stall ID or no Date, don't save it.
                if not stall_id or not date_of_assessment:
                    continue

                # enumerator_id = Enumerator
                enumerator_id = record.get('enumerator_id')

                # enumerator_id = Enumerator
                enumerator_id = record.get('enumerator') or record.get('enumerator_id')
                # X3 = Zonal officer (supervisor)
                zonal_officer = record.get('X3')

                # X4 = Date of assessment
                date_str = record.get('X4')
                date_of_assessment = parse_date(date_str) if date_str else None

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

                # Geolocation (Kobo standard)
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

                # --- SAVE TO DATABASE ---
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

            url = data.get('next')

        self.stdout.write(self.style.SUCCESS(f"Sync Complete! Created: {total_saved}, Updated: {total_updated}"))