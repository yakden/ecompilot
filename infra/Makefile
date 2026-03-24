# ─────────────────────────────────────────────────────────────────────────────
# EcomPilot Infrastructure — Makefile
# Root: infra/
# ─────────────────────────────────────────────────────────────────────────────

# ── Configuration ─────────────────────────────────────────────────────────────
SHELL         := /bin/bash
.SHELLFLAGS   := -euo pipefail -c
.DEFAULT_GOAL := help
.PHONY: help dev test lint build deploy-staging deploy-prod \
        infra-plan infra-apply infra-plan-staging infra-apply-staging \
        infra-plan-prod infra-apply-prod \
        logs status bootstrap \
        k8s-diff-staging k8s-diff-prod k8s-apply-staging k8s-apply-prod \
        argocd-sync argocd-diff \
        tf-fmt tf-validate tf-lint \
        clean

# ── Variables ─────────────────────────────────────────────────────────────────
INFRA_DIR         ?= $(shell pwd)
TF_STAGING_DIR    := $(INFRA_DIR)/terraform/environments/staging
TF_PROD_DIR       := $(INFRA_DIR)/terraform/environments/production
TF_BOOTSTRAP_DIR  := $(INFRA_DIR)/terraform/bootstrap
K8S_DIR           := $(INFRA_DIR)/k8s
ARGOCD_DIR        := $(INFRA_DIR)/argocd

# Kubernetes context (override via env)
KUBE_CONTEXT_STAGING ?= $(shell kubectl config get-contexts -o name 2>/dev/null | grep staging || echo "ecompilot-staging")
KUBE_CONTEXT_PROD    ?= $(shell kubectl config get-contexts -o name 2>/dev/null | grep prod || echo "ecompilot-prod")
KUBE_NAMESPACE       ?= ecompilot

# Docker / image settings
REGISTRY     ?= ghcr.io/ecompilot
IMAGE_TAG    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
SERVICES     := auth-service analytics-service suppliers-service calc-service \
                ai-service billing-service content-service legal-service \
                academy-service community-service notification-service \
                api-gateway marketplace-hub logistics-engine \
                ksef-service payment-reconciliation

# Terraform plan file names
TF_PLAN_STAGING := $(TF_STAGING_DIR)/.terraform-staging.tfplan
TF_PLAN_PROD    := $(TF_PROD_DIR)/.terraform-prod.tfplan

# Colors for output
BOLD  := \033[1m
GREEN := \033[32m
BLUE  := \033[34m
CYAN  := \033[36m
RESET := \033[0m

# ─────────────────────────────────────────────────────────────────────────────
# help — list available targets
# ─────────────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@printf "$(BOLD)EcomPilot Infrastructure Makefile$(RESET)\n"
	@echo ""
	@printf "$(CYAN)Development:$(RESET)\n"
	@printf "  $(GREEN)make dev$(RESET)                   Start local development environment\n"
	@printf "  $(GREEN)make test$(RESET)                  Run infrastructure tests\n"
	@printf "  $(GREEN)make lint$(RESET)                  Lint all Terraform + Kubernetes manifests\n"
	@printf "  $(GREEN)make build SERVICE=name$(RESET)    Build Docker image for a specific service\n"
	@printf "  $(GREEN)make build-all$(RESET)             Build all 16 service Docker images\n"
	@echo ""
	@printf "$(CYAN)Deployment:$(RESET)\n"
	@printf "  $(GREEN)make deploy-staging$(RESET)        Full deploy to staging (infra + k8s)\n"
	@printf "  $(GREEN)make deploy-prod$(RESET)           Full deploy to production (infra + k8s)\n"
	@printf "  $(GREEN)make k8s-apply-staging$(RESET)     Apply Kubernetes manifests to staging\n"
	@printf "  $(GREEN)make k8s-apply-prod$(RESET)        Apply Kubernetes manifests to production\n"
	@echo ""
	@printf "$(CYAN)Terraform:$(RESET)\n"
	@printf "  $(GREEN)make infra-plan$(RESET)            Plan production Terraform changes\n"
	@printf "  $(GREEN)make infra-apply$(RESET)           Apply production Terraform changes\n"
	@printf "  $(GREEN)make infra-plan-staging$(RESET)    Plan staging Terraform changes\n"
	@printf "  $(GREEN)make infra-apply-staging$(RESET)   Apply staging Terraform changes\n"
	@printf "  $(GREEN)make infra-plan-prod$(RESET)       Plan production Terraform changes\n"
	@printf "  $(GREEN)make infra-apply-prod$(RESET)      Apply production Terraform changes\n"
	@printf "  $(GREEN)make bootstrap$(RESET)             Bootstrap Terraform state backend\n"
	@printf "  $(GREEN)make tf-fmt$(RESET)                Format all Terraform files\n"
	@printf "  $(GREEN)make tf-validate$(RESET)           Validate all Terraform configurations\n"
	@printf "  $(GREEN)make tf-lint$(RESET)               Run tflint on all modules\n"
	@echo ""
	@printf "$(CYAN)ArgoCD:$(RESET)\n"
	@printf "  $(GREEN)make argocd-sync$(RESET)           Force sync all ArgoCD applications\n"
	@printf "  $(GREEN)make argocd-diff$(RESET)           Show ArgoCD diff for all apps\n"
	@echo ""
	@printf "$(CYAN)Operations:$(RESET)\n"
	@printf "  $(GREEN)make logs SERVICE=name$(RESET)     Tail logs for a specific service\n"
	@printf "  $(GREEN)make status$(RESET)                Show cluster and application status\n"
	@printf "  $(GREEN)make clean$(RESET)                 Remove local build artifacts\n"
	@echo ""

# ─────────────────────────────────────────────────────────────────────────────
# dev — start local development environment with kind or docker compose
# ─────────────────────────────────────────────────────────────────────────────
dev:
	@printf "$(BOLD)Starting local development environment...$(RESET)\n"
	@if command -v kind &> /dev/null; then \
		echo "Using kind for local Kubernetes..."; \
		kind create cluster --name ecompilot-local --config $(INFRA_DIR)/kind-config.yaml 2>/dev/null || echo "Cluster already exists"; \
		kubectl config use-context kind-ecompilot-local; \
	else \
		echo "kind not found. Starting Docker Compose services..."; \
		docker compose -f $(INFRA_DIR)/../docker-compose.yml up -d postgres redis nats; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# test — run infrastructure tests
# ─────────────────────────────────────────────────────────────────────────────
test: tf-validate
	@printf "$(BOLD)Running infrastructure tests...$(RESET)\n"
	@echo ""
	@echo "Testing Terraform modules..."
	@for dir in $(INFRA_DIR)/terraform/modules/*/; do \
		module=$$(basename $$dir); \
		printf "  Validating module: %s\n" "$$module"; \
		cd $$dir && terraform init -backend=false -input=false -no-color > /dev/null && \
		terraform validate -no-color && \
		cd $(INFRA_DIR); \
	done
	@echo ""
	@echo "Validating Kubernetes manifests..."
	@if command -v kubeconform &> /dev/null; then \
		kubeconform -strict -ignore-missing-schemas -kubernetes-version 1.30.0 \
			$(K8S_DIR)/base/ \
			$(K8S_DIR)/shared/ \
			$(K8S_DIR)/ingress/ \
			$(K8S_DIR)/network-policies/; \
	else \
		echo "kubeconform not found. Install: https://github.com/yannh/kubeconform"; \
	fi
	@echo ""
	@printf "$(GREEN)All tests passed.$(RESET)\n"

# ─────────────────────────────────────────────────────────────────────────────
# lint — lint all Terraform and Kubernetes files
# ─────────────────────────────────────────────────────────────────────────────
lint: tf-fmt tf-lint
	@printf "$(BOLD)Linting Kubernetes manifests...$(RESET)\n"
	@if command -v kustomize &> /dev/null; then \
		echo "Building kustomize overlays..."; \
		kustomize build $(K8S_DIR)/overlays/staging > /dev/null && echo "  staging: OK"; \
		kustomize build $(K8S_DIR)/overlays/production > /dev/null && echo "  production: OK"; \
	fi
	@if command -v kubectl &> /dev/null; then \
		kubectl apply --dry-run=client -f $(K8S_DIR)/network-policies/ > /dev/null 2>&1 && \
		echo "  network-policies: OK" || true; \
	fi
	@printf "$(GREEN)Lint complete.$(RESET)\n"

# ─────────────────────────────────────────────────────────────────────────────
# build — build Docker image for a specific service
# ─────────────────────────────────────────────────────────────────────────────
build:
ifndef SERVICE
	@echo "Usage: make build SERVICE=auth-service"
	@exit 1
endif
	@printf "$(BOLD)Building $(SERVICE):$(IMAGE_TAG)...$(RESET)\n"
	docker build \
		--build-arg SERVICE_NAME=$(SERVICE) \
		--build-arg NODE_VERSION=22 \
		-t $(REGISTRY)/$(SERVICE):$(IMAGE_TAG) \
		-t $(REGISTRY)/$(SERVICE):latest \
		-f $(INFRA_DIR)/docker/service.Dockerfile \
		$(INFRA_DIR)/..

build-all:
	@printf "$(BOLD)Building all 16 services...$(RESET)\n"
	@for svc in $(SERVICES); do \
		printf "  Building: %s\n" "$$svc"; \
		$(MAKE) build SERVICE=$$svc IMAGE_TAG=$(IMAGE_TAG); \
	done

# ─────────────────────────────────────────────────────────────────────────────
# deploy-staging — full staging deployment pipeline
# ─────────────────────────────────────────────────────────────────────────────
deploy-staging: infra-plan-staging
	@printf "$(BOLD)Deploying to staging...$(RESET)\n"
	@printf "$(BLUE)Step 1/3: Applying Terraform infrastructure...$(RESET)\n"
	@$(MAKE) infra-apply-staging
	@printf "$(BLUE)Step 2/3: Applying Kubernetes manifests...$(RESET)\n"
	@$(MAKE) k8s-apply-staging
	@printf "$(BLUE)Step 3/3: Syncing ArgoCD applications...$(RESET)\n"
	@$(MAKE) argocd-sync ENV=staging 2>/dev/null || echo "ArgoCD not available, skipping sync"
	@printf "$(GREEN)Staging deployment complete.$(RESET)\n"

# ─────────────────────────────────────────────────────────────────────────────
# deploy-prod — full production deployment pipeline (requires manual approval)
# ─────────────────────────────────────────────────────────────────────────────
deploy-prod:
	@printf "$(BOLD)Production Deployment$(RESET)\n"
	@printf "$(BLUE)This will deploy to PRODUCTION. Current branch: $(RESET)%s\n" \
		"$$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || \
		(echo "Aborted." && exit 1)
	@printf "$(BLUE)Step 1/4: Running Terraform plan...$(RESET)\n"
	@$(MAKE) infra-plan-prod
	@read -p "Review the plan above. Type 'apply' to proceed: " confirm && \
		[ "$$confirm" = "apply" ] || (echo "Aborted." && exit 1)
	@printf "$(BLUE)Step 2/4: Applying Terraform infrastructure...$(RESET)\n"
	@$(MAKE) infra-apply-prod
	@printf "$(BLUE)Step 3/4: Applying Kubernetes manifests...$(RESET)\n"
	@$(MAKE) k8s-apply-prod
	@printf "$(BLUE)Step 4/4: Syncing ArgoCD applications...$(RESET)\n"
	@$(MAKE) argocd-sync ENV=production 2>/dev/null || echo "ArgoCD sync triggered via git push"
	@printf "$(GREEN)Production deployment complete.$(RESET)\n"

# ─────────────────────────────────────────────────────────────────────────────
# Terraform targets
# ─────────────────────────────────────────────────────────────────────────────
infra-plan: infra-plan-prod

infra-apply: infra-apply-prod

infra-plan-staging:
	@printf "$(BOLD)Terraform plan — staging...$(RESET)\n"
	@cd $(TF_STAGING_DIR) && \
		terraform init -input=false -reconfigure && \
		terraform plan \
			-input=false \
			-var-file=terraform.tfvars \
			-out=$(TF_PLAN_STAGING) \
			-detailed-exitcode \
		; exitcode=$$?; \
		if [ $$exitcode -eq 0 ]; then echo "No changes."; \
		elif [ $$exitcode -eq 2 ]; then echo "Changes detected — review above."; \
		else exit $$exitcode; fi

infra-apply-staging:
	@printf "$(BOLD)Terraform apply — staging...$(RESET)\n"
	@if [ ! -f $(TF_PLAN_STAGING) ]; then \
		echo "No plan file found. Running plan first..."; \
		$(MAKE) infra-plan-staging; \
	fi
	@cd $(TF_STAGING_DIR) && \
		terraform apply -input=false -auto-approve $(TF_PLAN_STAGING)
	@rm -f $(TF_PLAN_STAGING)

infra-plan-prod:
	@printf "$(BOLD)Terraform plan — production...$(RESET)\n"
	@cd $(TF_PROD_DIR) && \
		terraform init -input=false -reconfigure && \
		terraform plan \
			-input=false \
			-var-file=terraform.tfvars \
			-out=$(TF_PLAN_PROD) \
			-detailed-exitcode \
		; exitcode=$$?; \
		if [ $$exitcode -eq 0 ]; then echo "No changes."; \
		elif [ $$exitcode -eq 2 ]; then echo "Changes detected — review above."; \
		else exit $$exitcode; fi

infra-apply-prod:
	@printf "$(BOLD)Terraform apply — production...$(RESET)\n"
	@if [ ! -f $(TF_PLAN_PROD) ]; then \
		echo "No plan file found. Running plan first..."; \
		$(MAKE) infra-plan-prod; \
	fi
	@cd $(TF_PROD_DIR) && \
		terraform apply -input=false $(TF_PLAN_PROD)
	@rm -f $(TF_PLAN_PROD)

bootstrap:
	@printf "$(BOLD)Bootstrapping Terraform state backend...$(RESET)\n"
	@printf "$(BLUE)This creates the S3 state bucket and DynamoDB lock table.$(RESET)\n"
	@read -p "Run bootstrap? This is a one-time operation. (yes/no): " confirm && \
		[ "$$confirm" = "yes" ] || (echo "Aborted." && exit 1)
	@cd $(TF_BOOTSTRAP_DIR) && \
		terraform init && \
		terraform apply -input=false -auto-approve
	@printf "$(GREEN)Bootstrap complete. Add the backend config to your environment main.tf files.$(RESET)\n"

tf-fmt:
	@printf "$(BOLD)Formatting Terraform files...$(RESET)\n"
	@terraform fmt -recursive $(INFRA_DIR)/terraform/ && \
		printf "$(GREEN)Format complete.$(RESET)\n"

tf-validate:
	@printf "$(BOLD)Validating Terraform configurations...$(RESET)\n"
	@for dir in $(TF_STAGING_DIR) $(TF_PROD_DIR); do \
		printf "  Validating: %s\n" "$$(basename $$dir)"; \
		cd $$dir && terraform init -backend=false -input=false -no-color -reconfigure > /dev/null 2>&1 && \
		terraform validate -no-color; \
		cd $(INFRA_DIR); \
	done
	@printf "$(GREEN)Validation complete.$(RESET)\n"

tf-lint:
	@printf "$(BOLD)Running tflint...$(RESET)\n"
	@if command -v tflint &> /dev/null; then \
		tflint --init && \
		for dir in $(INFRA_DIR)/terraform/modules/*/; do \
			printf "  Linting module: %s\n" "$$(basename $$dir)"; \
			tflint --chdir=$$dir --minimum-failure-severity=error; \
		done; \
		tflint --chdir=$(TF_STAGING_DIR) --minimum-failure-severity=error; \
		tflint --chdir=$(TF_PROD_DIR) --minimum-failure-severity=error; \
		printf "$(GREEN)tflint complete.$(RESET)\n"; \
	else \
		echo "tflint not installed. Install: https://github.com/terraform-linters/tflint"; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Kubernetes targets
# ─────────────────────────────────────────────────────────────────────────────
k8s-diff-staging:
	@printf "$(BOLD)Kubernetes diff — staging...$(RESET)\n"
	@kubectl --context=$(KUBE_CONTEXT_STAGING) diff \
		-k $(K8S_DIR)/overlays/staging || true

k8s-diff-prod:
	@printf "$(BOLD)Kubernetes diff — production...$(RESET)\n"
	@kubectl --context=$(KUBE_CONTEXT_PROD) diff \
		-k $(K8S_DIR)/overlays/production || true

k8s-apply-staging:
	@printf "$(BOLD)Applying Kubernetes manifests — staging...$(RESET)\n"
	@kubectl --context=$(KUBE_CONTEXT_STAGING) apply \
		-k $(K8S_DIR)/overlays/staging \
		--server-side \
		--force-conflicts
	@kubectl --context=$(KUBE_CONTEXT_STAGING) -n $(KUBE_NAMESPACE) \
		rollout status deployment --timeout=5m

k8s-apply-prod:
	@printf "$(BOLD)Applying Kubernetes manifests — production...$(RESET)\n"
	@printf "$(BLUE)Performing dry-run first...$(RESET)\n"
	@kubectl --context=$(KUBE_CONTEXT_PROD) apply \
		-k $(K8S_DIR)/overlays/production \
		--dry-run=server
	@read -p "Dry-run succeeded. Apply to production? (yes/no): " confirm && \
		[ "$$confirm" = "yes" ] || (echo "Aborted." && exit 1)
	@kubectl --context=$(KUBE_CONTEXT_PROD) apply \
		-k $(K8S_DIR)/overlays/production \
		--server-side \
		--force-conflicts
	@kubectl --context=$(KUBE_CONTEXT_PROD) -n $(KUBE_NAMESPACE) \
		rollout status deployment --timeout=10m

# ─────────────────────────────────────────────────────────────────────────────
# ArgoCD targets
# ─────────────────────────────────────────────────────────────────────────────
ENV ?= production

argocd-sync:
	@printf "$(BOLD)Syncing ArgoCD applications ($(ENV))...$(RESET)\n"
	@if command -v argocd &> /dev/null; then \
		argocd app sync -l "app.kubernetes.io/part-of=ecompilot" \
			--prune \
			--timeout 300 \
			--force; \
	else \
		echo "argocd CLI not installed. Trigger sync via ArgoCD UI or API."; \
	fi

argocd-diff:
	@printf "$(BOLD)ArgoCD diff for all EcomPilot applications...$(RESET)\n"
	@if command -v argocd &> /dev/null; then \
		for app in $(SERVICES); do \
			printf "\n--- ecompilot-$$app ---\n"; \
			argocd app diff ecompilot-$$app || true; \
		done; \
	else \
		echo "argocd CLI not installed."; \
	fi

# ─────────────────────────────────────────────────────────────────────────────
# Operations
# ─────────────────────────────────────────────────────────────────────────────
logs:
ifndef SERVICE
	@echo "Usage: make logs SERVICE=auth-service [ENV=staging|production]"
	@exit 1
endif
	@context=$$([ "$(ENV)" = "staging" ] && echo $(KUBE_CONTEXT_STAGING) || echo $(KUBE_CONTEXT_PROD)); \
	printf "$(BOLD)Tailing logs for $(SERVICE) in $(ENV)...$(RESET)\n"; \
	kubectl --context=$$context -n $(KUBE_NAMESPACE) logs \
		-l "app.kubernetes.io/name=$(SERVICE)" \
		--all-containers=true \
		--follow \
		--tail=100 \
		--prefix=true

status:
	@printf "$(BOLD)EcomPilot Cluster Status$(RESET)\n"
	@echo ""
	@for ctx in $(KUBE_CONTEXT_STAGING) $(KUBE_CONTEXT_PROD); do \
		printf "$(CYAN)Context: %s$(RESET)\n" "$$ctx"; \
		kubectl --context=$$ctx -n $(KUBE_NAMESPACE) get pods \
			-l "app.kubernetes.io/part-of=ecompilot" \
			-o wide 2>/dev/null || echo "  Cannot connect to context: $$ctx"; \
		echo ""; \
		printf "  HPA status:\n"; \
		kubectl --context=$$ctx -n $(KUBE_NAMESPACE) get hpa 2>/dev/null || true; \
		echo ""; \
	done

clean:
	@printf "$(BOLD)Cleaning build artifacts...$(RESET)\n"
	@rm -f $(TF_PLAN_STAGING) $(TF_PLAN_PROD)
	@find $(INFRA_DIR)/terraform -name ".terraform.lock.hcl" -not -path "*/bootstrap/*" | xargs rm -f 2>/dev/null || true
	@find $(INFRA_DIR)/terraform -name "*.tfplan" -delete 2>/dev/null || true
	@printf "$(GREEN)Clean complete.$(RESET)\n"
