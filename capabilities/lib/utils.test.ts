import { getAccountId, getRepositoryNames } from "./utils";

describe("getRepositoryNames", () => {
  it("correctly extracts repository name from different input images", () => {
    const testCases = [
      {
        input: "defenseunicorns/pepr/controller:v0.13.0",
        expected: "defenseunicorns/pepr/controller",
      },
      {
        input: "defenseunicorns/pepr/controller:latest",
        expected: "defenseunicorns/pepr/controller",
      },
      {
        input: "defenseunicorns/pepr/controller",
        expected: "defenseunicorns/pepr/controller",
      },
      {
        input: "ghcr.io/defenseunicorns/zarf/agent:local",
        expected: "defenseunicorns/zarf/agent",
      },
      {
        input: "ghcr.io/defenseunicorns/zarf/agent",
        expected: "defenseunicorns/zarf/agent",
      },
      {
        input: "registry1.dso.mil/defenseunicorns/zarf/agent:latest",
        expected: "defenseunicorns/zarf/agent",
      },
      {
        input:
          "defenseunicorns/zarf-game@sha256:f78e442f0f3eb3e9459b5ae6b1a8fda62f8dfe818112e7d130a4e8ae72b3cbff",
        expected: "defenseunicorns/zarf-game",
      },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = getRepositoryNames([input]);
      expect(result).toEqual([expected]);
    });
  });

  it("throws an error when the images input array is null", () => {
    const testFunction = () => getRepositoryNames([]);

    expect(testFunction).toThrow(
      "Error: expected at least 1 image reference, but got none",
    );
  });
});

describe("getAccountId", () => {
  const testCases = [
    {
      input: "123456789012.dkr.ecr.us-east-1.amazonaws.com",
      expected: "123456789012",
    },
    {
      input: "210987654321.dkr.ecr.us-west-2.amazonaws.com",
      expected: "210987654321",
    },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`correctly extracts AWS account ID from ${input}`, () => {
      const result = getAccountId(input);
      expect(result).toEqual(expected);
    });
  });

  it("throws an error when an invalid ECR URL is provided", () => {
    // Only has 11 digit account ID. Valid account IDs have 12 digits
    const invalidInput = "12345678901.dkr.ecr.us-east-1.amazonaws.com";

    const testFunction = () => getAccountId(invalidInput);

    expect(testFunction).toThrow(
      "Invalid private ECR URL format: 12345678901.dkr.ecr.us-east-1.amazonaws.com",
    );
  });
});
