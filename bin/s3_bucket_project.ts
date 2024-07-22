#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3BucketProjectStack } from '../lib/s3_bucket_project-stack';
import { CopierLambdaStack } from '../lib/copier-lambda-stack';
import { CleanerLambdaStack } from '../lib/cleaner-lambda-stack';

const app = new cdk.App();
const s3BucketProjectStack = new S3BucketProjectStack(app, 'S3BucketProjectStack', {
});

new CopierLambdaStack(app, 'CopierLambdaStack', {
  sourceBucketName: s3BucketProjectStack.sourceBucketName,
  destinationBucketName: s3BucketProjectStack.destinationBucketName,
});

new CleanerLambdaStack(app, 'CleanerLambdaStack', {
  destinationBucketName: s3BucketProjectStack.destinationBucketName,
});
