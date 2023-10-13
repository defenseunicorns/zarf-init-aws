# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2021-Present The Zarf Authors

# Provide a default value for the operating system architecture used in tests, e.g. " APPLIANCE_MODE=true|false make test-e2e ARCH=arm64"
ARCH ?= amd64
CLUSTER_NAME ?= ""
INSTANCE_TYPE ?= t3.small
EKS_PACKAGE := ./build/zarf-package-distro-eks-multi-0.0.4.tar.zst
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

build-module: ## Build the ECR Pepr module
	npm run build
	cp ./dist/pepr-module-b95dbd80-e078-5eb9-aaf3-bcb9567417d0.yaml ./manifests/

format-module: ## Format the ECR Pepr module
	npx pepr format

test-module: ## Test the ECR Pepr module
	npm run unit-test

# Note: the path to the main.go file is not used due to https://github.com/golang/go/issues/51831#issuecomment-1074188363
build-credential-helper-amd: ## Build the ECR credential helper binary for Linux on AMD64
	cd credential-helper && \
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(BUILD_ARGS)" -o ../build/zarf-ecr-credential-helper

aws-init-package: ## Build the AWS Zarf init package
	zarf package create -o build -a $(ARCH) --confirm .

eks-package: ## Build the EKS package
	zarf package create packages/eks -o build --confirm

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
	&& PULUMI_CONFIG_PASSPHRASE="" pulumi stack init ci \
	&& PULUMI_CONFIG_PASSPHRASE="" CLUSTER_NAME="$(CLUSTER_NAME)" pulumi up --yes

delete-iam: ## Delete AWS IAM policies and roles used in CI
	@cd iam || exit \
	&& PULUMI_CONFIG_PASSPHRASE="" pulumi down --yes \
	&& PULUMI_CONFIG_PASSPHRASE="" pulumi stack rm ci --yes
