// Package main updates Zarf image pull secrets with new ECR tokens
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ecr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/klog/v2"
)

const (
	zarfNamespace       = "zarf"
	zarfImagePullSecret = "private-registry"
	zarfStateSecret     = "zarf-state"
	zarfAgentLabel      = "zarf.dev/agent"
	zarfManagedByLabel  = "app.kubernetes.io/managed-by"
)

func main() {
	clientset, err := newK8sClient()
	if err != nil {
		klog.Errorf("failed to create Kubernetes clientset: %v", err)
		os.Exit(1)
	}

	ecrURL, err := getECRURL(clientset)
	if err != nil {
		klog.Errorf("failed to get ECR URL from zarf-state secret: %v", err)
		os.Exit(1)
	}

	authToken, err := fetchECRToken()
	if err != nil {
		klog.Errorf("failed to fetch ECR token: %v", err)
		os.Exit(1)
	}

	err = updateZarfManagedImageSecrets(clientset, ecrURL, authToken)
	if err != nil {
		klog.Errorf("failed to update ECR image pull credentials: %v", err)
		os.Exit(1)
	}
}

func newK8sClient() (*kubernetes.Clientset, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes client: %w", err)
	}

	return clientset, nil
}

func getECRURL(clientset *kubernetes.Clientset) (string, error) {
	secret, err := clientset.CoreV1().Secrets(zarfNamespace).Get(context.TODO(), zarfStateSecret, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get secret '%s' in namespace '%s': %w", zarfStateSecret, zarfNamespace, err)
	}

	var zarfState zarfState
	if err = json.Unmarshal(secret.Data["state"], &zarfState); err != nil {
		return "", fmt.Errorf("failed to unmarshal 'secret.data.state' from the '%s' secret", zarfStateSecret)
	}

	return zarfState.RegistryInfo.Address, nil
}

func fetchECRToken() (string, error) {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		return "", errors.New("AWS_REGION environment variable is not set")
	}

	sess, err := session.NewSessionWithOptions(session.Options{
		Config: aws.Config{Region: aws.String(region)},
	})
	if err != nil {
		return "", fmt.Errorf("failed to create AWS session: %w", err)
	}

	ecrClient := ecr.New(sess)

	authOutput, err := ecrClient.GetAuthorizationToken(&ecr.GetAuthorizationTokenInput{})
	if err != nil {
		return "", fmt.Errorf("error calling GetAuthorizationToken(): %w", err)
	}

	if len(authOutput.AuthorizationData) == 0 {
		return "", errors.New("No authorization data received")
	}

	return *authOutput.AuthorizationData[0].AuthorizationToken, nil
}

func updateZarfManagedImageSecrets(clientset *kubernetes.Clientset, ecrURL string, authToken string) error {
	namespaces, err := clientset.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing namespaces: %w", err)
	}

	for _, namespace := range namespaces.Items {
		registrySecret, err := clientset.CoreV1().Secrets(namespace.Name).Get(context.TODO(), zarfImagePullSecret, metav1.GetOptions{})
		if err != nil {
			continue
		}

		// Check if this is a Zarf managed secret or is in a namespace the Zarf agent will take action in
		if registrySecret.Labels[zarfManagedByLabel] == "zarf" ||
			(namespace.Labels[zarfAgentLabel] != "skip" && namespace.Labels[zarfAgentLabel] != "ignore") {

			// Update the secret with the new ECR auth token
			dockerConfigJSON := dockerConfig{
				Auths: dockerConfigEntry{
					ecrURL: dockerConfigEntryWithAuth{
						Auth: authToken,
					},
				},
			}
			dockerConfigData, err := json.Marshal(dockerConfigJSON)
			if err != nil {
				klog.Warningf("Failed to marshal docker config data for secret '%s' in namespace '%s': %v\n", registrySecret.Name, namespace.Name, err)
				continue
			}

			registrySecret.Data[".dockerconfigjson"] = dockerConfigData

			updatedRegistrySecret, err := clientset.CoreV1().Secrets(namespace.Name).Update(context.TODO(), registrySecret, metav1.UpdateOptions{})
			if err != nil {
				return fmt.Errorf("failed to update secret '%s' in namespace '%s': %w", updatedRegistrySecret.Name, namespace.Name, err)
			}
		}

		klog.Infof("Successfully updated secret '%s' in namespace '%s'\n", registrySecret.Name, namespace.Name)
	}

	return nil
}
