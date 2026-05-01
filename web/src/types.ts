export interface Variable {
  id: string;
  type: 'standard' | 'custom';
  category: 'Response' | 'Event' | 'Drug' | 'Other';
  usedInCount: number;
  usedInPercent: number;
  manikins: string[];
}

export interface Scenario {
  file: string;
  manikin: string;
  variableIds: string[];
}

export interface ScenarioData {
  generated: string;
  totalScenarios: number;
  sampledScenarios: number | null;
  variables: Variable[];
  scenarios: Scenario[];
}
