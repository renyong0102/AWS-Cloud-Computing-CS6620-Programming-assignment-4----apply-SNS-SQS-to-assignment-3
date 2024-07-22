import boto3
import os
import urllib.parse

def lambda_handler(event, context):
    s3 = boto3.client('s3')
    src_bucket = event['Records'][0]['s3']['bucket']['name']
    src_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    dst_bucket = os.environ['DESTINATION_BUCKET']
    dst_key = f"{src_key}"

    try:
        response = s3.head_object(Bucket=src_bucket, Key=src_key)
        size = response['ContentLength']
        s3.copy_object(Bucket=dst_bucket, CopySource={'Bucket': src_bucket, 'Key': src_key}, Key=dst_key)
        print(f"Successfully copied {src_key} from {src_bucket} to {dst_bucket} as {dst_key}. Size: {size} bytes")
        
         # Calculate total size of all objects in the destination bucket
        total_size = 0
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=dst_bucket)
        for page in pages:
            if 'Contents' in page:
                total_size += sum(obj['Size'] for obj in page['Contents'] if 'temp' in obj['Key'])

        # Log total size to CloudWatch Logs
        print(f"Total size of temp objects in {dst_bucket}. Size: {total_size} bytes")
        
    except Exception as e:
        print(f"Error copying object: {e}")
        raise e
