import os
import pandas as pd
from django.apps import AppConfig
from django.conf import settings


class DashboardConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'dashboard'

    def ready(self):
        # Only run this when the server starts, not during migrations
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('RENDER') is not None:
            from .models import TargetShop

            # Check if data is already there to avoid loading it on every single restart
            if TargetShop.objects.exists():
                return

            file_path = os.path.join(settings.BASE_DIR, 'Google GHMC wetmarket list (2).xlsx')

            if not os.path.exists(file_path):
                print(f"--> EXCEL FILE NOT FOUND AT: {file_path}")
                return

            print("--> Starting automatic Excel load...")
            try:
                xls = pd.ExcelFile(file_path)
                total_added = 0
                for sheet_name in xls.sheet_names:
                    if sheet_name.lower() == 'summary':
                        continue
                    df = pd.read_excel(xls, sheet_name=sheet_name)
                    df.columns = df.columns.str.strip()

                    if 'Shop Name' not in df.columns or 'Latitude' not in df.columns:
                        continue

                    for index, row in df.iterrows():
                        shop_name = str(row.get('Shop Name', '')).strip()
                        lat = row.get('Latitude')
                        lon = row.get('Longitude')

                        if shop_name and shop_name != 'nan' and pd.notna(lat) and pd.notna(lon):
                            TargetShop.objects.update_or_create(
                                shop_name=shop_name,
                                defaults={
                                    'zone': str(row.get('Zone', '')).strip(),
                                    'circle': str(row.get('Circle', '')).strip(),
                                    'ward_no': str(row.get('Ward No', '')).strip(),
                                    'ward_name': str(row.get('Ward Name', '')).strip(),
                                    'shop_type': str(row.get('Type of Shop', '')).strip(),
                                    'address': str(row.get('Address', '')).strip(),
                                    'latitude': float(lat),
                                    'longitude': float(lon)
                                }
                            )
                            total_added += 1
                print(f"--> SUCCESS! Automatically loaded {total_added} target shops.")
            except Exception as e:
                print(f"--> ERROR LOADING EXCEL: {e}")