# AWS Elastic Beanstalk deployment guide

## Prerequisites

- An AWS account with access to Amazon ECR and Elastic Beanstalk.
- An IAM principal with permissions to:
  - AmazonECR-FullAccess (or equivalent ECR push/pull permissions)
  - AWSElasticBeanstalkFullAccess (or equivalent Beanstalk service management)
  - EC2 permissions (Beanstalk provisions EC2 instances and a load balancer on your behalf)
  - Secrets Manager access if you plan to store the Gemini key as a secret
- A Docker-enabled machine for local build and test.
- The EB CLI installed locally (`pip install awsebcli`), or willingness to use the console instead.
- A valid Gemini API key.

## 1. Create an ECR repository

1. Open Amazon ECR in the AWS console.
2. Choose Create repository.
3. Name it, for example `ai-dsa-tutor`.
4. Keep the default settings unless your team has a preference.
5. Save the repository URI (for example `123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-dsa-tutor`).

## 2. Authenticate Docker to ECR

Run the following from your local terminal:

```powershell
aws ecr get-login-password --region <aws-region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<aws-region>.amazonaws.com
```

## 3. Build and push the image locally

From the project root:

```powershell
docker build -t ai-dsa-tutor:latest .
docker tag ai-dsa-tutor:latest <account-id>.dkr.ecr.<aws-region>.amazonaws.com/ai-dsa-tutor:latest
docker push <account-id>.dkr.ecr.<aws-region>.amazonaws.com/ai-dsa-tutor:latest
```

## 4. Create a Dockerrun.aws.json file

Elastic Beanstalk's single-container Docker platform needs a manifest telling it which image to pull and which port to expose. Create this file in your project root:

```json
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "<account-id>.dkr.ecr.<aws-region>.amazonaws.com/ai-dsa-tutor:latest",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": "8000"
    }
  ]
}
```

## 5. Create the Elastic Beanstalk application and environment

Using the console:

1. Open AWS Elastic Beanstalk.
2. Choose Create application.
3. Give it a name, for example `ai-dsa-tutor`.
4. Under Platform, choose **Docker** (single container).
5. Under Application code, choose **Upload your code** and upload the `Dockerrun.aws.json` file from step 4.
6. Choose a single-instance environment (no load balancer) if you want to minimize cost — under Configure more options → Capacity → Environment type, select **Single instance** instead of **Load balanced, auto scaling**.
7. Under Software, add environment variables:
   - `GEMINI_API_KEY` = your real Gemini API key
   - `GEMINI_MODEL` = optional override, for example `gemini-2.0-flash`
8. If you prefer not to expose the secret directly, create an AWS Secrets Manager secret and reference it from your application code instead of pasting the key into the console.
9. Choose an instance type covered by the free tier, for example `t2.micro` or `t3.micro`, under Capacity settings.
10. Choose Create environment and wait for it to finish provisioning.

Alternatively, using the EB CLI from the project root:

```powershell
eb init -p docker ai-dsa-tutor --region <aws-region>
eb create ai-dsa-tutor-env --single --instance-type t2.micro
eb setenv GEMINI_API_KEY=<your-key> GEMINI_MODEL=gemini-2.0-flash
```

## 6. Get the public URL

Once the environment is running (console shows a green "Health: Ok" status):

1. Open the Elastic Beanstalk environment dashboard.
2. Copy the environment URL shown near the top of the page (for example `ai-dsa-tutor-env.<region>.elasticbeanstalk.com`).
3. Open `https://<environment-url>/` to verify the frontend landing page.
4. Open `https://<environment-url>/health` to verify the API.
5. Open `https://<environment-url>/chat` and `https://<environment-url>/classify` with a POST request tool to confirm the endpoints respond.

## 7. Verify the deployment

Use the deployed URL to check:

- `https://<environment-url>/` renders the landing screen.
- `https://<environment-url>/health` returns JSON with the API status.
- `https://<environment-url>/chat` accepts POST requests.
- `https://<environment-url>/classify` accepts POST requests.

## Cost notes

Elastic Beanstalk itself has no additional charge, but it provisions underlying resources that do:

- A single EC2 instance (use a free-tier-eligible type such as `t2.micro` / `t3.micro` to stay within the free tier's monthly hour allowance).
- Choosing **Single instance** environment type avoids the separate Elastic Load Balancer charge that a load-balanced environment would add.
- Standard EBS storage for the instance's root volume, generally within free tier limits at small sizes.

For a small demo or assignment deployment on a free-tier-eligible instance type, expect this to run at little to no cost within the free tier window. If you need to avoid ongoing cost, terminate the environment (not just stop the instance) when you are done testing, since Beanstalk environments don't have a simple "pause" button the way App Runner does.
