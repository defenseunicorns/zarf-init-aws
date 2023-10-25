# Update the Zarf ECR init package

## Update the Pepr module

### Run unit tests

When making changes to the Pepr *.ts files are made, you can run the unit tests locally to test your changes:

```bash
make test-module
```

### Format the Pepr module

```bash
make format-ts
```

### Rebuild the Pepr module

```bash
make build-module
```

## Build the AWS init package

```bash
make aws-init-package
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

## Update the Zarf config file with registry type and IAM role ARNs

```bash
# Change REGISTRY_TYPE to public as needed
make update-zarf-config REGISTRY_TYPE="private"
```

## Zarf init

### Private ECR registry

```bash
make deploy-init-package-private 
```

### Public ECR registry

```bash
make deploy-init-package-public
```

## Cleanup

### Remove Zarf from the cluster

```bash
make destroy
```

### Teardown the cluster

```bash
make remove-eks-package
```

### Delete IAM roles

```bash
make delete-iam
```

### Delete private ECR repositories

```bash
make delete-private-repos
```

### Delete public ECR repositories

```bash
make delete-public-repos
```
