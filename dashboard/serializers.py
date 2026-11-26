from rest_framework import serializers
from .models import KoboSubmission, TargetShop

class KoboSubmissionSerializer(serializers.ModelSerializer):
    # Map 'enumerator_id' to 'submitted_by'
    submitted_by = serializers.CharField(source='enumerator_id', allow_null=True)
    zonal_officer_name = serializers.SerializerMethodField()

    class Meta:
        model = KoboSubmission
        fields = [
            'kobo_id',
            'stall_id',
            'zonal_officer_name',
            'date_of_assessment',
            'submitted_by',
            'owner_name',
            'owner_mobile',
            'shop_name',
            'shop_address',
            'risk_level',
            'latitude',
            'longitude',
            'submission_time'
        ]

    def get_zonal_officer_name(self, obj):
        officer_mapping = {
            'officer_1': 'Mohammed Nazeem',
            'officer_2': 'K. Murali Mohan',
            'officer_3': 'V. Kranthi Kumar',
            'other': 'Other',
        }
        return officer_mapping.get(obj.zonal_officer, obj.zonal_officer)
class TargetShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = TargetShop
        fields = '__all__'