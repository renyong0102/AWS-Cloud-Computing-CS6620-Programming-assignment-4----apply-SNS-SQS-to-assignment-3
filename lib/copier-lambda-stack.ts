// lib/copier-lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

interface CopierLambdaStackProps extends cdk.StackProps {
  sourceBucketName: string;
  destinationBucketName: string;
}

export class CopierLambdaStack extends cdk.Stack {
  // public readonly tempObjectsMetric: cloudwatch.IMetric;
  
  constructor(scope: Construct, id: string, props: CopierLambdaStackProps) {
    super(scope, id, props);

    const copierLogGroup = new logs.LogGroup(this, 'CopierLogs', {
      logGroupName: `/aws/lambda/copierLambdaLog`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK
    });
    
    const copierLambda = new lambda.Function(this, 'copier', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'copier.lambda_handler',
      code: lambda.Code.fromAsset('lambda/copier'),
      environment: {
        DESTINATION_BUCKET: props.destinationBucketName
      },
      logGroup: copierLogGroup
    });
    
    copierLogGroup.grantWrite(copierLambda);
    
    // Grant necessary permissions
    const sourceBucket = s3.Bucket.fromBucketName(this, 'SourceBucket', props.sourceBucketName);
    const destinationBucket = s3.Bucket.fromBucketName(this, 'DestinationBucket', props.destinationBucketName)
    
    sourceBucket.grantRead(copierLambda);
    destinationBucket.grantReadWrite(copierLambda);
    
    const policyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:HeadObject'],
      resources: [sourceBucket.bucketArn, sourceBucket.bucketArn+'/*', destinationBucket.bucketArn, destinationBucket.bucketArn+'/*',],
      effect: iam.Effect.ALLOW,
    });
    
    copierLambda.addToRolePolicy(policyStatement);
    
    sourceBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(copierLambda));
    
    const metricFilter = new logs.MetricFilter(this, 'MetricFilter', {
      logGroup: copierLogGroup,
      metricNamespace: 'CopierMetrics',
      metricName: 'copierFileSize',
      filterPattern: logs.FilterPattern.literal('[info=Total, ... , size_value, unit="bytes"]'),
      metricValue: '$size_value'
    });
  }
}
