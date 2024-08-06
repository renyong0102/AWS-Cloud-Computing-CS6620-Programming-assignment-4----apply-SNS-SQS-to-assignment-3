// lib/cleaner-lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda_event_source from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';

interface CleanerLambdaStackProps extends cdk.StackProps {
  destinationBucketName: string;
}

export class CleanerLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CleanerLambdaStackProps) {
    super(scope, id, props);

    // Create SNS topic
    const cleanerTopic = new sns.Topic(this, 'CleanerTopic');
    
        // Create SQS queue
    const cleanerQueue = new sqs.Queue(this, 'CleanerQueue', {
      visibilityTimeout: cdk.Duration.seconds(50),
    });
    
    
    // Subscribe SQS queue to SNS topic
    cleanerTopic.addSubscription(new subscriptions.SqsSubscription(cleanerQueue));
    
    const cleanerLambda = new lambda.Function(this, 'CleanerLambda', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'cleaner.lambda_handler',
      code: lambda.Code.fromAsset('lambda/cleaner'),
      environment: {
        DESTINATION_BUCKET: props.destinationBucketName
      }
    });
  
    // set SQS queue as Lambda event source
    cleanerLambda.addEventSource(new lambda_event_source.SqsEventSource(cleanerQueue, {
        batchSize: 1
    }));
    
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
    
    // alarm.addAlarmAction(new actions.LambdaAction(cleanerLambda));
    // Add SNS action to the alarm
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(cleanerTopic));
    
    // alarm.addAlarmAction(new cloudwatch.actions.SnsAction(cleanerTopic));
  }
}
