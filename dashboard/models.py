from django.db import models


class KoboSubmission(models.Model):
    # Kobo's internal unique ID for the submission
    kobo_id = models.CharField(max_length=255, unique=True, db_index=True)

    # Base assessment fields
    stall_id = models.CharField(max_length=255, blank=True, null=True)
    zonal_officer = models.CharField(max_length=255, blank=True, null=True)
    date_of_assessment = models.DateField(blank=True, null=True)

    # New fields requested
    enumerator_id = models.CharField(max_length=255, blank=True, null=True)
    owner_name = models.CharField(max_length=255, blank=True, null=True)
    owner_mobile = models.CharField(max_length=255, blank=True, null=True)
    shop_name = models.CharField(max_length=255, blank=True, null=True)
    shop_address = models.TextField(blank=True, null=True)  # Using TextField for potentially long addresses
    risk_level = models.CharField(max_length=255, blank=True, null=True)

    # Geographical coordinates
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)

    # Timestamps
    submission_time = models.DateTimeField(blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.stall_id} - {self.shop_name} ({self.zonal_officer})"


class TargetShop(models.Model):
    zone = models.CharField(max_length=255, blank=True, null=True)
    circle = models.CharField(max_length=255, blank=True, null=True)
    ward_no = models.CharField(max_length=50, blank=True, null=True)
    ward_name = models.CharField(max_length=255, blank=True, null=True)
    shop_name = models.CharField(max_length=255, unique=True)  # Prevent duplicates
    shop_type = models.CharField(max_length=255, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)

    # This will be calculated by comparing with Kobo surveys
    is_completed = models.BooleanField(default=False)

    def __str__(self):
        return self.shop_name