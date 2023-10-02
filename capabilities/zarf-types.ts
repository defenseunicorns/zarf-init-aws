export interface DeployedPackage {
  componentWebhooks?: { [key: string]: { [key: string]: Webhook } };
  deployedComponents: DeployedComponent[];
  generation: number;
  name: string;
  data: ZarfPackage;
}

export interface ZarfPackage {
  components: ZarfComponent[];
}

export interface ZarfComponent {
  images?: string[];
  name: string;
}

export interface DeployedComponent {
  images: string[];
  name: string;
  observedGeneration: number;
  status: string;
}

export interface Webhook {
  name: string;
  observedGeneration: number;
  status: string;
  waitDurationSeconds?: number;
}

export interface ZarfState {
  /**
   * Information about the container registry Zarf is configured to use
   */
  registryInfo: RegistryInfo;
}

export interface RegistryInfo {
  /**
   * URL address of the registry
   */
  address: string;
  /**
   * Indicates if we are using a registry that Zarf is directly managing
   */
  internalRegistry: boolean;
}
