# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2021-Present The Zarf Authors

# Provide a default value for the operating system architecture used in tests, e.g. " APPLIANCE_MODE=true|false make test-e2e ARCH=arm64"
ARCH ?= amd64
ZARF_VERSION ?= $$(zarf version)
CREDENTIAL_HELPER_BIN := ./build/zarf-ecr-credential-helper
CLUSTER_NAME ?= ""
INSTANCE_TYPE ?= t3.small
EKS_PACKAGE := ./build/zarf-package-distro-eks-multi-0.0.5.tar.zst
REGISTRY_TYPE ?= ""
######################################################################################

.DEFAULT_GOAL := help

.PHONY: help
help: ## Display this help information
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN {FS = ":.*?## "}; \
	  {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

clean: ## Clean the build directory
	rm -rf build

destroy: ## Run `zarf destroy` on the current cluster
	zarf destroy --confirm --remove-components

delete-packages: ## Delete all Zarf package tarballs in the project recursively
	find . -type f -name 'zarf-package-*' -delete

lint-ts: ## Validate formatting of all typescript code in the repository
	npx pepr format --validate-only

# Note: This will automatically make changes to .ts files
format-ts: ## Format all typescript code in the repository
	npx pepr format

build-module: ## Build the ECR Pepr module
	npm run build
	cp ./dist/pepr-module-b95dbd80-e078-5eb9-aaf3-bcb9567417d0.yaml ./manifests/

test-module: ## Test the ECR Pepr module
	npm run unit-test

# Note: the path to the main.go file is not used due to https://github.com/golang/go/issues/51831#issuecomment-1074188363
build-credential-helper-linux-amd: ## Build the ECR credential helper binary for Linux on AMD64
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ./build/zarf-ecr-credential-helper

build-local-credential-helper-image: ## Build the ECR credential helper image to be used in a locally built init package
	@test -s $(CREDENTIAL_HELPER_BIN) || $(MAKE) build-credential-helper-linux-amd
	docker buildx build --load --platform linux/$(ARCH) --tag ghcr.io/defenseunicorns/zarf-init-aws/ecr-credential-helper:local .

aws-init-package: ## Build the AWS Zarf init package
	zarf package create -o build -a $(ARCH) --confirm .

# INTERNAL: used to build a release version of the AWS init package with a specific credential-helper image
release-aws-init-package:
	zarf package create -o build -a $(ARCH) --set CREDENTIAL_HELPER_IMAGE_TAG=$(CREDENTIAL_HELPER_IMAGE_TAG) --confirm .

# INTERNAL: used to publish the AWS init package
publish-aws-init-package:
	zarf package publish build/zarf-init-$(ARCH)-$(ZARF_VERSION).tar.zst oci://$(REPOSITORY_URL)
	zarf package publish . oci://$(REPOSITORY_URL)

eks-package: ## Build the EKS package
	zarf package create packages/eks -a multi -o build --confirm

deploy-eks-package: ## Deploy the EKS package to create an EKS cluster
	@if [ -z "$(CLUSTER_NAME)" ]; then \
		echo "Error: CLUSTER_NAME is not provided. Please set CLUSTER_NAME with a valid cluster name."; \
		echo "Example: make deploy-eks-package CLUSTER_NAME=my-cluster-name"; \
		exit 1; \
	fi

	@test -s $(EKS_PACKAGE) || { $(MAKE) eks-package; } 

	zarf package deploy $(EKS_PACKAGE) \
        --components="deploy-eks-cluster" \
        --set=EKS_CLUSTER_NAME="$(CLUSTER_NAME)" \
        --set=EKS_INSTANCE_TYPE="$(INSTANCE_TYPE)" \
        --confirm

remove-eks-package: ## Remove the EKS package to teardown an EKS cluster
	zarf package remove $(EKS_PACKAGE) --confirm

create-iam: ## Create AWS IAM policies and roles used in CI
	@if [ -z "$(CLUSTER_NAME)" ]; then \
		echo "Error: CLUSTER_NAME is not provided. Please set CLUSTER_NAME with an existing EKS cluster name."; \
		echo "Example: make create-iam CLUSTER_NAME=my-cluster-name"; \
		exit 1; \
	fi

	@cd iam || exit \
	&& pulumi logout \
	&& pulumi login --local \
	&& test $$(pulumi stack --show-name --non-interactive) || PULUMI_CONFIG_PASSPHRASE="" pulumi stack init ci \
	&& PULUMI_CONFIG_PASSPHRASE="" CLUSTER_NAME="$(CLUSTER_NAME)" pulumi up --yes

delete-iam: ## Delete AWS IAM policies and roles used in CI
	@cd iam || exit \
	&& PULUMI_CONFIG_PASSPHRASE="" pulumi down --yes \
	&& PULUMI_CONFIG_PASSPHRASE="" pulumi stack rm ci --yes

update-zarf-config: ## Update Zarf config file with registry type and IAM role ARN values
	@cd iam || exit \
	&& node ../hack/update-zarf-config.mjs "$(REGISTRY_TYPE)" "$$(PULUMI_CONFIG_PASSPHRASE="" pulumi stack output webhookRoleArn)" "$$(PULUMI_CONFIG_PASSPHRASE="" pulumi stack output credentialHelperRoleArn)"

deploy-init-package-private: ## Run zarf init to deploy the AWS init package configured with private ECR registry
	@cd build || exit \
	&& ZARF_CONFIG="../zarf-config.yaml" zarf init \
		--registry-url="$$(aws sts get-caller-identity --query 'Account' --output text).dkr.ecr.us-east-1.amazonaws.com" \
        --registry-push-username="AWS" \
        --registry-push-password="$$(aws ecr get-login-password --region us-east-1)" \
        --components="zarf-ecr-credential-helper" \
        --confirm

delete-private-repos: ## Delete private ECR repos created by deploying the AWS init package
	@repos="defenseunicorns/pepr/controller defenseunicorns/zarf/agent defenseunicorns/zarf-init-aws/ecr-credential-helper"; \
	for repo in $${repos}; do \
		aws ecr delete-repository --repository-name "$$repo" --force || true; \
	done

deploy-init-package-public: ## Run zarf init to deploy the AWS init package configured with public ECR registry
	@cd build || exit \
	&& ZARF_CONFIG="../zarf-config.yaml" zarf init \
		--registry-url="$$(aws ecr-public describe-registries --query 'registries[0].registryUri' --output text --region us-east-1)" \
        --registry-push-username="AWS" \
        --registry-push-password="$$(aws ecr-public get-login-password --region us-east-1)" \
        --components="zarf-ecr-credential-helper" \
        --confirm

delete-public-repos: ## Delete public ECR repos created by deploying the AWS init package
	@repos="defenseunicorns/pepr/controller defenseunicorns/zarf/agent defenseunicorns/zarf-init-aws/ecr-credential-helper"; \
	for repo in $${repos}; do \
		aws ecr-public delete-repository --repository-name "$$repo" --force || true; \
	done

# INTERNAL: used to test for new CVEs that may have been introduced
test-cves:
	zarf tools sbom packages --exclude './binaries' . -o json | grype --fail-on low

cve-report: ## Create a CVE report for the current project (must `brew install grype` first)
	zarf tools sbom packages --exclude './binaries' . -o json | grype -o template -t hack/.templates/grype.tmpl > build/zarf-known-cves.csv
