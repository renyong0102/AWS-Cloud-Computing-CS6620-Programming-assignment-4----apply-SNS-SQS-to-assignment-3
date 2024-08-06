import boto3
import os
import json

def log_lambda_handler(event, context):
    s3 = boto3.client('s3')

    dst_bucket = os.getenv('DESTINATION_BUCKET')
    if not dst_bucket:
        raise ValueError("DESTINATION_BUCKET environment variable is not set")

    for record in event['Records']:
        # load sqs message
        message = json.loads(record['body'])
        print(f"Received message: {message}")

    try:
        total_size = 0
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=dst_bucket)
        
        for page in pages:
            if 'Contents' in page:
                total_size += sum(obj['Size'] for obj in page['Contents'] if 'temp' in obj['Key'])

        print(f"Total size of temp objects in {dst_bucket}: {total_size} bytes")
        
        sqs = boto3.client('sqs')
        # show delete message
        receipt_handle = record['receiptHandle']
        sqs.delete_message(
            QueueUrl=os.environ['LOGGER_QUEUE_URL'],
            ReceiptHandle=receipt_handle
        )
        
    except Exception as e:
        print(f"Error calculating total size: {e}")
        raise

    return {
        'statusCode': 200,
        'body': f"Total size of temp objects in {dst_bucket}: {total_size} bytes"
    }

# def log_lambda_handler(event, context):
#     s3 = boto3.client('s3')
#     # dst_bucket = event['destination_bucket']
#     dst_bucket = os.environ['DESTINATION_BUCKET']

#     try:
#         total_size = 0
#         paginator = s3.get_paginator('list_objects_v2')
#         pages = paginator.paginate(Bucket=dst_bucket)
#         for page in pages:
#             if 'Contents' in page:
#                 total_size += sum(obj['Size'] for obj in page['Contents'] if 'temp' in obj['Key'])

#         # Log total size to CloudWatch Logs
#         print(f"Total size of temp objects in {dst_bucket}. Size: {total_size} bytes")
        
#     except Exception as e:
#         print(f"Error calculating total size: {e}")
#         raise e
