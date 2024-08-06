// lib/copier-lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambda_event_source from 'aws-cdk-lib/aws-lambda-event-sources';

interface CopierLambdaStackProps extends cdk.StackProps {
  sourceBucketName: string;
  destinationBucketName: string;
}

export class CopierLambdaStack extends cdk.Stack {
  // public readonly tempObjectsMetric: cloudwatch.IMetric;
  constructor(scope: Construct, id: string, props: CopierLambdaStackProps) {
    super(scope, id, props);
    
    // create SNS topic
    const topic = new sns.Topic(this, 'CopierTopic');
    
    // Create SQS queues
    const copierQueue = new sqs.Queue(this, 'CopierQueue', {
      visibilityTimeout: cdk.Duration.seconds(50)
    });
    
    const loggerQueue = new sqs.Queue(this, 'LogQueue', {
      visibilityTimeout: cdk.Duration.seconds(50)
    });

    // Subscribe SQS queues to the SNS topic
    topic.addSubscription(new subscriptions.SqsSubscription(copierQueue));
    // Remove this line, as it is no longer necessary to trigger the logLambda through the SNS topic subscription
    // topic.addSubscription(new subscriptions.SqsSubscription(loggerQueue));
    
    //store the copier lambda and log lambda into copierLogGroup
    const copierLogGroup = new logs.LogGroup(this, 'CopierLogs', {
      logGroupName: `/aws/lambda/copierLambdaLog`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK
    });
    
    //create copier hander lambda
    const copierLambda = new lambda.Function(this, 'copier', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'copier.copy_lambda_handler',
      code: lambda.Code.fromAsset('lambda/copier'),
      environment: {
        DESTINATION_BUCKET: props.destinationBucketName,
        LOGGER_QUEUE_URL: loggerQueue.queueUrl,
        COPIER_QUEUE_URL: copierQueue.queueUrl
      },
      logGroup: copierLogGroup
    });
    
    // set SQS queue as Lambda event source
    copierLambda.addEventSource(new lambda_event_source.SqsEventSource(copierQueue, {
        batchSize: 1  // deal one message each time
    }));
    
    // Create log handler Lambda
    const logLambda = new lambda.Function(this, 'logger', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'logger.log_lambda_handler',
      code: lambda.Code.fromAsset('lambda/copier'),
      environment: {
        DESTINATION_BUCKET: props.destinationBucketName,
        LOGGER_QUEUE_URL: loggerQueue.queueUrl
      },
      logGroup: copierLogGroup
    });
    
    // set SQS queue as Lambda event source
    logLambda.addEventSource(new lambda_event_source.SqsEventSource(loggerQueue, {
        batchSize: 1  
    }));
    
    const policyStatementQueue = new iam.PolicyStatement({
      actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
      resources: [copierQueue.queueArn, loggerQueue.queueArn],
      effect: iam.Effect.ALLOW
    });
    
    //give permission to copier lambda send message to logger queue
    const sendMessagePolicy = new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [loggerQueue.queueArn],
      effect: iam.Effect.ALLOW
    });
    copierLambda.addToRolePolicy(sendMessagePolicy);

    copierLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'CopierLambdaSQSPolicy', {
        statements: [policyStatementQueue]
      })
    );

    logLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'LoggerLambdaSQSPolicy', {
        statements: [policyStatementQueue]
      })
    );

    copierLogGroup.grantWrite(copierLambda);
    copierLogGroup.grantWrite(logLambda);

    // Grant necessary permissions
    const sourceBucket = s3.Bucket.fromBucketName(this, 'SourceBucket', props.sourceBucketName);
    const destinationBucket = s3.Bucket.fromBucketName(this, 'DestinationBucket', props.destinationBucketName)
    
    sourceBucket.grantRead(copierLambda);
    destinationBucket.grantReadWrite(copierLambda);
    sourceBucket.grantRead(logLambda);
    destinationBucket.grantReadWrite(logLambda);
    
    const policyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:HeadObject'],
      resources: [sourceBucket.bucketArn, sourceBucket.bucketArn+'/*', destinationBucket.bucketArn, destinationBucket.bucketArn+'/*',],
      effect: iam.Effect.ALLOW,
    });
    
    copierLambda.addToRolePolicy(policyStatement);
    logLambda.addToRolePolicy(policyStatement);
    
    //attach sns policy to lambda
    // const snsPolicy = new iam.PolicyStatement({
    //   actions: ['sns:Subscribe', 'sns:Receive'],
    //   resources: [topic.topicArn],
    //   effect: iam.Effect.ALLOW,
    // });
    
    // copierLambda.addToRolePolicy(snsPolicy);
    // logLambda.addToRolePolicy(snsPolicy);
        
    // // put Lambda funtion into SNS topic
    // topic.addSubscription(new subscriptions.LambdaSubscription(copierLambda));
    // topic.addSubscription(new subscriptions.LambdaSubscription(logLambda));
    
    // sourceBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(copierLambda));
    sourceBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SnsDestination(topic));
    
    const metricFilter = new logs.MetricFilter(this, 'MetricFilter', {
      logGroup: copierLogGroup,
      metricNamespace: 'CopierMetrics',
      metricName: 'copierFileSize',
      filterPattern: logs.FilterPattern.literal('[info=Total, ... , size_value, unit="bytes"]'),
      metricValue: '$size_value'
    });
  }
}
