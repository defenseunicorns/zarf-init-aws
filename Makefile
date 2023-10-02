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
	rm -fr build

delete-packages: ## Delete all Zarf package tarballs in the project recursively
	find . -type f -name 'zarf-package-*' -delete

build-capability: ## Build the ECR Pepr capability
	npm ci
	npm run build
	cp ./dist/pepr-module-b95dbd80-e078-5eb9-aaf3-bcb9567417d0.yaml ./manifests/

test-capability: ## Test the ECR Pepr capability
	npm ci
	npm run unit-test

# Note: the path to the main.go file is not used due to https://github.com/golang/go/issues/51831#issuecomment-1074188363

build-credential-helper-amd: ## Build the ECR credential helper binary for Linux on AMD64
	cd credential-helper && \
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="$(BUILD_ARGS)" -o ../build/zarf-ecr-credential-helper

# INTERNAL: a shim used to build the agent image only if needed on Windows using the `test` command
init-package-local-agent:
	@test "$(AGENT_IMAGE_TAG)" != "local" || $(MAKE) build-local-agent-image

build-local-agent-image: ## Build the Zarf agent image to be used in a locally built init package
	docker buildx build --load --platform linux/$(ARCH) --tag ghcr.io/defenseunicorns/zarf/agent:local .

ecr-init-package: ## Create the ECR zarf init package
	zarf package create -o build -a $(ARCH) --confirm . -l debug
