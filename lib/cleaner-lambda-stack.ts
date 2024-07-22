// lib/cleaner-lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';

interface CleanerLambdaStackProps extends cdk.StackProps {
  destinationBucketName: string;
}

export class CleanerLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CleanerLambdaStackProps) {
    super(scope, id, props);

    const cleanerLambda = new lambda.Function(this, 'CleanerLambda', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'cleaner.lambda_handler',
      code: lambda.Code.fromAsset('lambda/cleaner'),
      environment: {
        DESTINATION_BUCKET: props.destinationBucketName
      }
    });
  
    // Grant permissions to cleaner Lambda
    const destinationBucket = s3.Bucket.fromBucketName(this, 'DestinationBucket', props.destinationBucketName);
    destinationBucket.grantReadWrite(cleanerLambda);
    
    const policyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:HeadObject'],
      resources: [destinationBucket.bucketArn,],
      effect: iam.Effect.ALLOW,
    });
    
    cleanerLambda.addToRolePolicy(policyStatement);
    
    // Add CloudWatch Alarm
    const alarm = new cloudwatch.Alarm(this, 'FileSizeAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'CopierMetrics',
        metricName: 'copierFileSize',
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1)
        // period: cdk.Duration.seconds(30)
      }),
      threshold: 3072, 
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    
    alarm.addAlarmAction(new actions.LambdaAction(cleanerLambda));
  }
}
