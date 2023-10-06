# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2021-Present The Zarf Authors

# Provide a default value for the operating system architecture used in tests, e.g. " APPLIANCE_MODE=true|false make test-e2e ARCH=arm64"
ARCH ?= amd64
KEY ?= ""
######################################################################################

CLI_VERSION ?= $(if $(shell git describe --tags),$(shell git describe --tags),"UnknownVersion")
GIT_SHA := $(if $(shell git rev-parse HEAD),$(shell git rev-parse HEAD),"")
BUILD_DATE := $(shell date -u +'%Y-%m-%dT%H:%M:%SZ')
BUILD_ARGS := -s -w -X 'github.com/defenseunicorns/zarf/src/config.CLIVersion=$(CLI_VERSION)' -X 'k8s.io/component-base/version.gitVersion=v0.0.0+zarf$(CLI_VERSION)' -X 'k8s.io/component-base/version.gitCommit=$(GIT_SHA)' -X 'k8s.io/component-base/version.buildDate=$(BUILD_DATE)'
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
	npm ci
	npm run build
	cp ./dist/pepr-module-b95dbd80-e078-5eb9-aaf3-bcb9567417d0.yaml ./manifests/

format-module: ## Format the ECR Pepr module
	npx pepr format

test-module: ## Test the ECR Pepr module
	npm ci
	npm run unit-test

# Note: the path to the main.go file is not used due to https://github.com/golang/go/issues/51831#issuecomment-1074188363
build-credential-helper-amd: ## Build the ECR credential helper binary for Linux on AMD64
	cd credential-helper && \
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(BUILD_ARGS)" -o ../build/zarf-ecr-credential-helper

aws-init-package: ## Build the AWS Zarf init package
	zarf package create -o build -a $(ARCH) --confirm .

eks-package: ## Build the EKS package
	zarf package create packages/eks -o build --confirm
