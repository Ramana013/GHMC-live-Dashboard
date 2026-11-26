# dashboard/tasks.py
from celery import shared_task
# ... import models and requests, etc.

@shared_task
def sync_kobo_data_task():
    # Put your logic to fetch data from Kobo and write to the database here
    # Note: Do not return JsonResponse here, return a string or simple result
    print("Start syncing Kobo data...")
    # ... specific request and database update code ...
    return "Sync complete"