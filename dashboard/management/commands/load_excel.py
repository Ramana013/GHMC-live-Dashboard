import pandas as pd
from django.core.management.base import BaseCommand
from dashboard.models import TargetShop
import os


class Command(BaseCommand):
    help = 'Loads shops from the Excel file'

    def handle(self, *args, **kwargs):
        # Because the file is next to manage.py, we just use the current working directory
        file_path = os.path.join(os.getcwd(), 'Google GHMC wetmarket list (2).xlsx')

        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f"File not found at: {file_path}"))
            self.stdout.write("Please ensure the Excel file is in the same folder as manage.py")
            return

        self.stdout.write(f"Reading Excel file from: {file_path}...")

        try:
            xls = pd.ExcelFile(file_path)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to open Excel: {e}"))
            return

        total_added = 0
        total_skipped = 0

        for sheet_name in xls.sheet_names:
            self.stdout.write(f"Processing sheet: {sheet_name}...")

            if sheet_name.lower() == 'summary':
                self.stdout.write(" -> Skipping summary sheet.")
                continue

            # Read the sheet
            df = pd.read_excel(xls, sheet_name=sheet_name)

            # Clean up column names (remove trailing spaces that cause errors)
            df.columns = df.columns.str.strip()

            # Check if required columns exist
            if 'Shop Name' not in df.columns:
                self.stdout.write(f" -> No 'Shop Name' column found in {sheet_name}. Columns are: {list(df.columns)}")
                continue
            if 'Latitude' not in df.columns or 'Longitude' not in df.columns:
                self.stdout.write(f" -> Missing Latitude/Longitude columns in {sheet_name}.")
                continue

            for index, row in df.iterrows():
                shop_name = str(row.get('Shop Name', '')).strip()
                lat = row.get('Latitude')
                lon = row.get('Longitude')

                # Check if data is valid (not empty or NaN)
                if shop_name and shop_name != 'nan' and pd.notna(lat) and pd.notna(lon):
                    try:
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
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f" -> Error saving '{shop_name}': {e}"))
                else:
                    total_skipped += 1

        self.stdout.write(
            self.style.SUCCESS(f'\nSUCCESS! Loaded {total_added} shops. Skipped {total_skipped} empty rows.'))