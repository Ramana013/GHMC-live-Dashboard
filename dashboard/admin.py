from django.contrib import admin
from .models import KoboSubmission

@admin.register(KoboSubmission)
class KoboSubmissionAdmin(admin.ModelAdmin):
    # This controls what columns show up in the list view
    list_display = ('stall_id', 'shop_name', 'zonal_officer', 'risk_level', 'date_of_assessment')
    # This adds a search bar at the top
    search_fields = ('stall_id', 'shop_name', 'zonal_officer')
    # This adds filters on the right side
    list_filter = ('risk_level', 'zonal_officer')