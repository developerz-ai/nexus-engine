<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Deploy Target — AWS

Enterprise option. Full service menu. **Expensive vs Fly/Hetzner/self-host but unmatched at scale**, region coverage, compliance, and managed game services (GameLift, FleetIQ).

→ Overview: `docs/guides/deploy/overview.md`. Cost: `docs/guides/deploy/cost-model.md`.

---

## Service map

| Need | AWS service |
|------|-------------|
| Containerized backend (HTTP/TCP) | ECS Fargate · App Runner |
| Containerized + K8s | EKS |
| Dedicated game servers w/ matchmaking | GameLift (Servers + Streams) · GameLift FleetIQ (spot) |
| K8s game-server fleet (DIY) | EKS + Agones (→ `docs/guides/deploy/targets/agones.md`) |
| Asset storage / CDN | S3 + CloudFront |
| Postgres | RDS (Aurora optional) |
| Lobby cache | ElastiCache (Redis) · DynamoDB |
| Auth | Cognito |
| Secrets | Secrets Manager |
| Observability | CloudWatch · X-Ray · Managed Grafana |
| CDN | CloudFront |
| DNS | Route 53 |
| Edge functions | Lambda@Edge · CloudFront Functions |

Authoritative docs: https://docs.aws.amazon.com

---

## Prerequisites

| Item | |
|------|--|
| AWS account + billing alarm | Set $X/day budget alarm immediately |
| `aws` CLI v2 | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| IAM user/role for CI via OIDC | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html |
| Terraform / CDK / Pulumi for infra-as-code | Pick one. Stick with it. |

---

## Reference architecture — ECS Fargate game server

```
   Route 53 (DNS)
        │
   CloudFront (assets)
        │
   ALB (HTTP)      ← Cognito JWT validation
        │
   ECS Fargate service (auto-scale, multi-AZ)
        │
   RDS Postgres (Multi-AZ) ─ ElastiCache Redis
        │
   Secrets Manager ─ CloudWatch + X-Ray
```

UDP game servers: ECS Fargate **does not support UDP**. Use:
- ECS on EC2 with `protocol: "udp"` on a Network Load Balancer (NLB)
- GameLift (purpose-built)
- EKS + Agones

GameLift docs: https://docs.aws.amazon.com/gamelift/

---

## Terraform — ECS Fargate skeleton

`infra/aws/main.tf`:

```hcl
terraform {
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
  backend "s3" { bucket = "nexus-tfstate"; key = "prod/terraform.tfstate"; region = "us-east-1" }
}

provider "aws" { region = var.region }

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  name = "nexus-${var.env}"
  cidr = "10.0.0.0/16"
  azs = ["${var.region}a", "${var.region}b", "${var.region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = var.env != "prod"
}

resource "aws_ecs_cluster" "main" {
  name = "nexus-${var.env}"
  setting { name = "containerInsights"; value = "enabled" }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "nexus-api-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name  = "api"
    image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
    portMappings = [{ containerPort = 8080 }]
    environment = [{ name = "NEXUS_ENV", value = var.env }]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/nexus-${var.env}"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "nexus-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  launch_type     = "FARGATE"
  desired_count   = var.env == "prod" ? 3 : 1
  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }
  health_check_grace_period_seconds = 30
}
```

ECS Fargate docs: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/

Apply:

```bash
terraform init
terraform plan -var env=prod -var image_tag=$GITHUB_SHA
terraform apply -auto-approve -var env=prod -var image_tag=$GITHUB_SHA
```

---

## GameLift Servers (matchmaking + fleet)

For shooters/MOBAs needing FlexMatch:

```bash
aws gamelift create-build \
  --name "nexus-server-$GITHUB_SHA" \
  --build-version $GITHUB_SHA \
  --operating-system AMAZON_LINUX_2 \
  --server-sdk-version 5.2.0

aws gamelift create-fleet \
  --name nexus-prod-iad \
  --build-id <id> \
  --ec2-instance-type c7g.large \
  --fleet-type SPOT \
  --runtime-configuration 'ServerProcesses=[{LaunchPath=/local/game/nexus-server,ConcurrentExecutions=1}]'
```

GameLift FlexMatch: https://docs.aws.amazon.com/gamelift/latest/flexmatchguide/

Cost vs Fly: a c7g.large in GameLift FleetIQ spot = ~$0.03/hr vs Fly perf-2x ~$0.04/hr. GameLift adds matchmaking + queues for free; Fly does not.

---

## CI/CD via OIDC

`.github/workflows/deploy-aws.yml`:

```yaml
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT }}:role/github-deploy
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |
          docker build -t $ECR/nexus-api:$GITHUB_SHA -f Dockerfile.api .
          docker push $ECR/nexus-api:$GITHUB_SHA
      - run: terraform -chdir=infra/aws apply -auto-approve -var image_tag=$GITHUB_SHA
```

---

## Smoke test

```bash
nexus deploy smoke --env prod --target aws
# or manually:
aws ecs describe-services --cluster nexus-prod --services nexus-api --query 'services[0].runningCount'
curl -fsS https://api.example.com/healthz
```

---

## Rollback

```bash
aws ecs update-service --cluster nexus-prod --service nexus-api \
  --task-definition nexus-api-prod:<prev-revision> --force-new-deployment
# or
nexus deploy rollback --env prod --target aws
```

GameLift: deploy new fleet alias to point at prior build.

---

## Cost note

| Component | 100k MAU | 10M MAU |
|-----------|----------|---------|
| ECS Fargate (110 tasks) | ~$1,800 | n/a — switch to EC2 |
| NAT Gateway (3 AZ × 3 regions) | ~$600 | ~$2,000 |
| ALB | ~$60 | ~$200 |
| RDS Postgres (Multi-AZ) | ~$400 | ~$5,000+ |
| CloudFront + S3 (assets) | ~$450 | ~$45,000 |
| CloudWatch logs/metrics | ~$200 | ~$2,000+ |
| Data transfer (cross-AZ + egress) | ~$500 | ~$15,000+ |
| **Total approx** | **~$4,000** | **~$700,000+** |

Pricing: https://aws.amazon.com/pricing/
NAT Gateway tax is real: $0.045/hr per gateway × per AZ. Use VPC endpoints to cut.

---

## Pitfalls

- **NAT Gateway costs.** Single-AZ NAT for non-prod saves ~$60/mo per region.
- **Cross-AZ data transfer.** RDS Multi-AZ + cross-AZ ECS = transfer fees pile up.
- **CloudFront free tier expired**. Compare R2 unless you need Lambda@Edge.
- **Fargate UDP** — not supported. Use ECS-on-EC2 + NLB or GameLift.
- **Trusting Aurora Serverless v2 for game state**. It scales down to 0.5 ACU; cold-warm transition can stall.

---

## When AWS is worth it

| Reason | |
|--------|--|
| Compliance: SOC 2, HIPAA, FedRAMP | AWS has the broadest set |
| Region you need is only on AWS | e.g., `me-south-1` Bahrain |
| Enterprise contract / committed spend discounts | Negotiated EDPs > list price |
| Need GameLift FlexMatch out-of-box | Purpose-built |
| Multi-cloud strategy already on AWS | Stay consistent |

If none apply: Fly + Hetzner + Cloudflare beats AWS on cost by ~5–10×.

---

## Cross-links

- K8s game-server fleet → `docs/guides/deploy/targets/agones.md`
- GCP equivalent → `docs/guides/deploy/targets/gcp.md`
- Asset CDN cheaper → `docs/guides/deploy/targets/cloudflare.md`
- Pipeline → `docs/guides/deploy/cicd.md`
- Cost detail → `docs/guides/deploy/cost-model.md`
