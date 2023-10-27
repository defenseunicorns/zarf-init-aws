package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/alecthomas/jsonschema"
	"github.com/defenseunicorns/zarf/src/types"
	"github.com/spf13/cobra"
)

type ZarfTypes struct {
	DeployedPackage types.DeployedPackage `json:"deployedPackage"`
	ZarfState       types.ZarfState       `json:"zarfState"`
}

func main() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "gen-schema",
	Short: "Generates a JSON schema from Zarf types",
	Run: func(cmd *cobra.Command, args []string) {
		schema := jsonschema.Reflect(&ZarfTypes{})
		output, err := json.MarshalIndent(schema, "", "  ")
		if err != nil {
			fmt.Printf("unable to generate the JSON schema from the Zarf types: %v\n", err)
			os.Exit(1)
		}
		fmt.Print(string(output) + "\n")
	},
}
