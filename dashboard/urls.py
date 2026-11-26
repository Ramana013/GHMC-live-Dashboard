from django.urls import path
from .views import KoboSubmissionListView, TargetShopListView, UploadTargetShopsView, kobo_webhook
from . import views

urlpatterns = [
    path('submissions/', KoboSubmissionListView.as_view(), name='submission-list'),
    path('target-shops/', TargetShopListView.as_view(), name='target-shops'),
    path('upload-targets/', UploadTargetShopsView.as_view(), name='upload-targets'),
    path('kobo-webhook/', kobo_webhook, name='kobo-webhook'),
    path('kobo-sync/', views.sync_kobo_data, name='kobo-sync'),]