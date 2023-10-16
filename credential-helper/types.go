package main

type DockerConfig struct {
	Auths DockerConfigEntry `json:"auths"`
}

type DockerConfigEntry map[string]DockerConfigEntryWithAuth

type DockerConfigEntryWithAuth struct {
	Auth string `json:"auth"`
}

type RegistryInfo struct {
	Address string `json:"address" jsonschema:"description=URL address of the registry"`
}

type ZarfState struct {
	RegistryInfo RegistryInfo `json:"registryInfo" jsonschema:"description=Information about the container registry Zarf is configured to use"`
}
