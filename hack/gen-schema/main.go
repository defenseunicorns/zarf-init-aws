package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/alecthomas/jsonschema"
	"github.com/defenseunicorns/zarf/src/types"
)

type ZarfTypes struct {
	DeployedPackage types.DeployedPackage
	ZarfState       types.ZarfState
}

func main() {
	schema := jsonschema.Reflect(&ZarfTypes{})
	output, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		fmt.Printf("unable to generate the JSON schema from the Zarf types: %v\n", err)
		os.Exit(1)
	}
	fmt.Print(string(output) + "\n")
}
