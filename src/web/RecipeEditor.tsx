import type { ReactElement } from "react";
import type { RetirementPlanInputs } from "../retirementDate.js";

const sampleRecipe = `{
  "version": 1,
  "accounts": [
    {
      "id": "primaryHome",
      "name": "Primary home",
      "kind": "real-estate",
      "balances": { "realEstate": 400000 }
    },
    {
      "id": "mortgage",
      "name": "Mortgage",
      "kind": "debt",
      "balances": { "principal": -200000 }
    }
  ],
  "rules": [
    {
      "id": "pay-mortgage",
      "when": { "source": "accountTotal", "accountId": "mortgage", "operator": "<", "value": 0 },
      "actions": [
        {
          "type": "transfer",
          "fromAccountId": "nonRetirementPortfolio",
          "fromAssetClass": "cash",
          "toAccountId": "mortgage",
          "toAssetClass": "principal",
          "amount": 1500,
          "limitToAvailable": true,
          "kind": "debt-payment"
        }
      ]
    },
    {
      "id": "spending-cut-under-1m",
      "when": {
        "source": "portfolioTotal",
        "accountIds": ["nonRetirementPortfolio", "retirementPortfolio"],
        "operator": "<",
        "value": 1000000
      },
      "actions": [
        { "type": "setRetirementSpending", "amount": 40000, "period": "annual" }
      ]
    },
    {
      "id": "spending-cut-under-750k",
      "when": {
        "source": "portfolioTotal",
        "accountIds": ["nonRetirementPortfolio", "retirementPortfolio"],
        "operator": "<",
        "value": 750000
      },
      "actions": [
        { "type": "setRetirementSpending", "amount": 35000, "period": "annual" }
      ]
    }
  ]
}`;

export function RecipeEditor(props: {
  inputs: RetirementPlanInputs;
  onChange: (inputs: RetirementPlanInputs) => void;
}): ReactElement {
  return (
    <details className="recipe-editor" open={props.inputs.recipeJson.trim().length > 0}>
      <summary>Recipe JSON</summary>
      <textarea
        className="recipe-textarea"
        spellCheck={false}
        value={props.inputs.recipeJson}
        placeholder={sampleRecipe}
        onChange={(event) => props.onChange({ ...props.inputs, recipeJson: event.target.value })}
      />
    </details>
  );
}
