#!/usr/bin/env bash
# exit on error
set -o errexit

# Build React frontend
cd ghmc-frontend
npm install
npm run build
cd ..

# Install Python dependencies
pip install -r requirements.txt

# Collect static files and migrate database
python manage.py collectstatic --noinput
python manage.py migrate

# Load the Excel data into the database
echo "Starting Excel load..."
python manage.py load_excel
echo "Excel load finished!"