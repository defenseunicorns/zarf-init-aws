# Update the Zarf ECR init package

## Update the Pepr module

### Run unit tests

When making changes to the Pepr *.ts files are made, you can run the unit tests locally to test your changes:

```bash
make test-module
```

### Format the Pepr module

```bash
make format-module
```

### Rebuild the Pepr module

```bash
make build-module
```

## Create EKS cluster

```bash
make deploy-eks-package CLUSTER_NAME=my-cluster-name
```

## Create IAM roles to authenticate to ECR

Note: The EKS cluster that is provided via CLUSTER_NAME must be ready/available

```bash
make create-iam CLUSTER_NAME=my-cluster-name
```

## Build the AWS init package

```bash
make aws-init-package
```

## Update the Zarf config file with registry type and IAM role ARNs

```bash
# Change REGISTRY_TYPE to public as needed
make update-zarf-config REGISTRY_TYPE="private"
```

## Zarf init

Note: Ensure the init package is in the root of the repository so that the zarf-config.toml file can be used:

```bash
cp ./build/zarf-init-*.tar.zst .
```

```bash
# Private ECR registry
zarf init \
    --registry-url="$(aws sts get-caller-identity --query 'Account' --output text).dkr.ecr.us-east-1.amazonaws.com" \
    --registry-push-username="AWS" \
    --registry-push-password="$(aws ecr get-login-password --region us-east-1)" \
    --components="zarf-ecr-credential-helper" \
    --confirm
```

```bash
# Public ECR registry
zarf init \
    --registry-url="$(aws ecr-public describe-registries --query 'registries[0].registryUri' --output text --region us-east-1)" \
    --registry-push-username="AWS" \
    --registry-push-password="$(aws ecr-public get-login-password --region us-east-1)" \
    --components="zarf-ecr-credential-helper" \
    --confirm
```
