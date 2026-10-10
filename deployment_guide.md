# Deploying AI DSA Tutor to AWS Elastic Beanstalk

The application runs as one Docker container: Next.js is exported to static files during the image build and FastAPI serves both the API and the frontend. Elastic Beanstalk provisions and manages the EC2 instance, but the Docker image is stored in Amazon ECR.

Two deployment routes are supported:

- **Manual Docker route:** build and push from your own computer, then deploy the image through Elastic Beanstalk.
- **GitHub Actions route:** a push to `main` builds the same Docker image, pushes it to ECR, and asks Elastic Beanstalk to deploy it.

Both routes use the same `Dockerfile` and target the same Elastic Beanstalk application/environment. Use one route at a time for a given change to keep the deployed version clear.

## One-time AWS setup

Choose one AWS region and replace the placeholders below with your own values.

```text
AWS_REGION=ap-south-1
ECR_REPOSITORY=ai-dsa-tutor
EB_APPLICATION_NAME=ai-dsa-tutor
EB_ENVIRONMENT_NAME=ai-dsa-tutor-prod
EB_ARTIFACT_BUCKET=<globally-unique-eb-artifact-bucket>
```

1. Create a private Amazon ECR repository named `ai-dsa-tutor`.
2. Create an S3 bucket for Elastic Beanstalk version bundles in the same region. Do not make it public.
3. In Elastic Beanstalk, create an application and a **Docker** environment. For a low-cost demo, choose **Single instance** and an instance size appropriate for your account (for example, `t3.micro` where available).
4. In the environment's **Configuration → Updates, monitoring, and logging**, set a health check path of `/health`.
5. In **Configuration → Software**, add the environment variables:
   - `GEMINI_API_KEY` — the real Gemini API key.
   - `GEMINI_MODEL` — optional; defaults to the application's configured model.
6. Ensure the Elastic Beanstalk EC2 instance profile can pull the image from ECR. The managed `AmazonEC2ContainerRegistryReadOnly` policy is sufficient for that purpose.

The Gemini key stays in Elastic Beanstalk environment configuration; it is neither committed to Git nor baked into the Docker image.

## Option A: manual Docker deployment

Prerequisites: Docker and the AWS CLI are installed and authenticated to the AWS account.

From the repository root, authenticate Docker to ECR, build the image, and push a uniquely tagged version:

```powershell
$region = "<aws-region>"
$accountId = "<aws-account-id>"
$repository = "ai-dsa-tutor"
$tag = "manual-$(Get-Date -Format yyyyMMddHHmmss)"
$registry = "$accountId.dkr.ecr.$region.amazonaws.com"

aws ecr get-login-password --region $region |
  docker login --username AWS --password-stdin $registry

docker build -t "$registry/$repository`:$tag" .
docker push "$registry/$repository`:$tag"
```

Create a `Dockerrun.aws.json` file containing the exact image URI (or update the root manifest before packaging):

```json
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "<account-id>.dkr.ecr.<aws-region>.amazonaws.com/ai-dsa-tutor:<tag>",
    "Update": "true"
  },
  "Ports": [{ "ContainerPort": "8000" }]
}
```

Zip that file by itself and upload it as a new Elastic Beanstalk application version in the console, then deploy that version to the environment. Alternatively, use the EB CLI after creating the environment:

```powershell
eb init -p docker ai-dsa-tutor --region <aws-region>
eb deploy <environment-name>
```

## Option B: GitHub Actions deployment

The workflow at `.github/workflows/deploy.yml` publishes a commit-specific Docker image and deploys that exact image. It uses OpenID Connect (OIDC) instead of permanent AWS access keys.

### Configure GitHub repository variables

In **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | The ECR/Elastic Beanstalk region, e.g. `ap-south-1` |
| `ECR_REPOSITORY` | `ai-dsa-tutor` |
| `EB_APPLICATION_NAME` | Your Elastic Beanstalk application name |
| `EB_ENVIRONMENT_NAME` | Your Elastic Beanstalk environment name |
| `EB_ARTIFACT_BUCKET` | The private S3 bucket created above |

In **Settings → Secrets and variables → Actions → Secrets**, add:

| Secret | Value |
| --- | --- |
| `AWS_ROLE_ARN` | ARN of the GitHub Actions OIDC deployment role |

### Create the AWS OIDC deployment role

Create an IAM role trusted by GitHub's OIDC provider (`token.actions.githubusercontent.com`). Restrict its trust policy to this repository and the `main` branch. The role needs permission to:

- obtain an ECR authorization token and push images to this one ECR repository;
- upload deployment bundles to the one artifact S3 bucket;
- create Elastic Beanstalk application versions and update the one environment;
- pass the Elastic Beanstalk service role only if your account policy requires it.

Avoid broad administrator permissions. AWS's IAM policy generator and the IAM Access Analyzer policy validation tool are useful for limiting the final policy to your account and resources.

After those values are present, a push to `main` (or a manual **Run workflow** in GitHub Actions) deploys the app. The workflow waits until Elastic Beanstalk reports that the environment update is complete.

## Verify and manage costs

When Elastic Beanstalk is green, verify:

- `https://<environment-url>/` loads the application.
- `https://<environment-url>/health` returns status JSON.
- A tutor request reaches the backend (requires `GEMINI_API_KEY`).

Elastic Beanstalk itself has no extra service fee, but it creates billable AWS resources: EC2, EBS, ECR storage, S3 storage, and sometimes a load balancer. A **single-instance** environment avoids the load-balancer charge. Terminate the Elastic Beanstalk environment when it is no longer needed; stopping an EC2 instance alone is not sufficient because Beanstalk may replace it.
