import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class S3BucketProjectStack extends cdk.Stack {
  public readonly sourceBucketName: string;
  public readonly destinationBucketName: string;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceBucket = new s3.Bucket(this, 'source', {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const destinationBucket = new s3.Bucket(this, 'destination', {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    this.sourceBucketName = sourceBucket.bucketName;
    this.destinationBucketName = destinationBucket.bucketName; 
  }
}
