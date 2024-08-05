import boto3
import json
import os
import urllib.parse

def lambda_handler(event, context):
    s3 = boto3.client('s3')
    bucket = os.environ['DESTINATION_BUCKET']
    
    try:
        for record in event['Records']:
            # SQS message body contains the original SNS message
            sns_message = json.loads(record['body'])  # 从 SQS 消息体中获取 SNS 消息
            s3_event = json.loads(sns_message['Message'])  # 获取 SNS 消息中的 S3 事件

            # Initialize the pagination
            paginator = s3.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket)

            # Collect all objects that include 'temp' in their key
            temp_objects = []
            for page in pages:
                if 'Contents' in page:
                    temp_objects.extend([obj for obj in page['Contents'] if 'temp' in obj['Key']])

            if not temp_objects:
                print("No temporary files to delete.")
                return
            
            # Find the oldest object
            oldest_key = min(temp_objects, key=lambda x: x['LastModified'])['Key']

            # Delete the oldest 'temp' object
            s3.delete_object(Bucket=bucket, Key=oldest_key)
            print(f"Successfully deleted oldest temporary file: {oldest_key}")
    except Exception as e:
        print(f"Error in cleaning temporary files: {e}")
        raise e

# import boto3
# import os

# def lambda_handler(event, context):
#     s3 = boto3.client('s3')
#     bucket = os.environ['DESTINATION_BUCKET']
    
#     try:
#         # Initialize the pagination
#         paginator = s3.get_paginator('list_objects_v2')
#         pages = paginator.paginate(Bucket=bucket)

#         # Collect all objects that include 'temp' in their key
#         temp_objects = []
#         for page in pages:
#             if 'Contents' in page:
#                 temp_objects.extend([obj for obj in page['Contents'] if 'temp' in obj['Key']])

#         if not temp_objects:
#             print("No temporary files to delete.")
#             return
        
#         # Find the oldest object
#         oldest_key = min(temp_objects, key=lambda x: x['LastModified'])['Key']

#         # Delete the oldest 'temp' object
#         s3.delete_object(Bucket=bucket, Key=oldest_key)
#         print(f"Successfully deleted oldest temporary file: {oldest_key}")
#     except Exception as e:
#         print(f"Error in cleaning temporary files: {e}")
#         raise e
