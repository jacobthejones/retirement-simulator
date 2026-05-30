import { BookOpen, X } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
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

const examples = [
  {
    name: "Spending guardrails",
    summary: "Lower retirement spending when combined portfolio value crosses reserve thresholds.",
    json: `{
  "version": 1,
  "rules": [
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
}`,
  },
  {
    name: "Consulting fallback",
    summary: "Add part-time income in retirement only when portfolio reserves are thin.",
    json: `{
  "version": 1,
  "rules": [
    {
      "id": "consult-when-under-900k",
      "when": [
        { "source": "retired", "equals": true },
        {
          "source": "portfolioTotal",
          "accountIds": ["nonRetirementPortfolio", "retirementPortfolio"],
          "operator": "<",
          "value": 900000
        }
      ],
      "actions": [
        {
          "type": "addAmount",
          "accountId": "nonRetirementPortfolio",
          "assetClass": "cash",
          "amount": 1800,
          "kind": "income"
        }
      ]
    }
  ]
}`,
  },
  {
    name: "Rental sale",
    summary: "Model rental income, a property sale, and paying off the rental loan.",
    json: `{
  "version": 1,
  "accounts": [
    { "id": "rental", "name": "Rental property", "kind": "real-estate", "balances": { "realEstate": 300000 } },
    { "id": "rentalLoan", "name": "Rental mortgage", "kind": "debt", "balances": { "principal": -120000 } }
  ],
  "rules": [
    {
      "id": "monthly-rental-net-income",
      "actions": [
        { "type": "addAmount", "accountId": "nonRetirementPortfolio", "amount": 900, "kind": "income" }
      ]
    },
    {
      "id": "sell-rental",
      "when": { "source": "month", "operator": "==", "value": "2040-01" },
      "actions": [
        {
          "type": "transfer",
          "fromAccountId": "rental",
          "fromAssetClass": "realEstate",
          "toAccountId": "nonRetirementPortfolio",
          "toAssetClass": "cash",
          "amount": 300000
        },
        {
          "type": "transfer",
          "fromAccountId": "nonRetirementPortfolio",
          "fromAssetClass": "cash",
          "toAccountId": "rentalLoan",
          "toAssetClass": "principal",
          "amount": 120000,
          "kind": "debt-payment"
        }
      ]
    }
  ]
}`,
  },
  {
    name: "Cash reserve top-up",
    summary: "Keep taxable cash at a reserve target by drawing from another account with a haircut.",
    json: `{
  "version": 1,
  "rules": [
    {
      "id": "taxable-cash-reserve",
      "when": [
        { "source": "retired", "equals": true },
        {
          "source": "accountBalance",
          "accountId": "nonRetirementPortfolio",
          "assetClass": "cash",
          "operator": "<",
          "value": 50000
        }
      ],
      "actions": [
        {
          "type": "topUpAccount",
          "accountId": "nonRetirementPortfolio",
          "assetClass": "cash",
          "targetBalance": 50000,
          "fromAccountId": "retirementPortfolio",
          "fromAssetClass": "cash",
          "penaltyRate": 0.2,
          "limitToAvailable": true
        }
      ]
    }
  ]
}`,
  },
] as const;

export function RecipeEditor(props: {
  inputs: RetirementPlanInputs;
  onChange: (inputs: RetirementPlanInputs) => void;
}): ReactElement {
  const [docsOpen, setDocsOpen] = useState(false);
  const [selectedExample, setSelectedExample] = useState(0);

  useEffect(() => {
    if (!docsOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDocsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [docsOpen]);

  function setRecipeJson(recipeJson: string): void {
    props.onChange({ ...props.inputs, recipeJson });
  }

  return (
    <div className="recipe-editor">
      <div className="recipe-editor-heading">
        <span>Recipe JSON</span>
        <button type="button" className="button button-secondary recipe-guide-button" onClick={() => setDocsOpen(true)}>
          <BookOpen size={16} />
          Guide
        </button>
      </div>
      <details open={props.inputs.recipeJson.trim().length > 0}>
        <summary>Editor</summary>
        <textarea
          className="recipe-textarea"
          spellCheck={false}
          value={props.inputs.recipeJson}
          placeholder={sampleRecipe}
          onChange={(event) => setRecipeJson(event.target.value)}
        />
      </details>
      {docsOpen ? (
        <div className="recipe-doc-backdrop" role="presentation" onMouseDown={() => setDocsOpen(false)}>
          <section
            className="recipe-doc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-doc-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="recipe-doc-heading">
              <div>
                <p className="eyebrow">Recipe reference</p>
                <h2 id="recipe-doc-title">Build scenario rules with JSON.</h2>
              </div>
              <button type="button" className="icon-button" title="Close recipe guide" onClick={() => setDocsOpen(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="recipe-doc-grid">
              <section className="recipe-doc-section">
                <h3>Shape</h3>
                <pre>{`{
  "version": 1,
  "accounts": [],
  "rules": [
    {
      "id": "rule-name",
      "when": [],
      "actions": []
    }
  ]
}`}</pre>
                <p>
                  Built-in accounts are <code>nonRetirementPortfolio</code> and <code>retirementPortfolio</code>. Extra accounts can model rentals, debt, business equity, reserves, or other buckets.
                </p>
              </section>

              <section className="recipe-doc-section">
                <h3>Conditions</h3>
                <p>
                  Use <code>when</code> as one condition or an array. Arrays require every condition to match.
                </p>
                <ul>
                  <li><code>retired</code>: match before or after the retirement month.</li>
                  <li><code>month</code> / <code>monthIndex</code>: match calendar or elapsed time.</li>
                  <li><code>accountTotal</code> / <code>accountBalance</code>: match one account.</li>
                  <li><code>portfolioTotal</code>: match a list of accounts or all accounts.</li>
                </ul>
              </section>

              <section className="recipe-doc-section">
                <h3>Actions</h3>
                <ul>
                  <li><code>addAmount</code>: add income, expense, debt payment, or another monthly cash flow.</li>
                  <li><code>transfer</code>: move money between accounts or assets.</li>
                  <li><code>topUpAccount</code>: refill an account to a target balance from another account.</li>
                  <li><code>setRetirementSpending</code>: set a fixed retirement spending amount.</li>
                  <li><code>setRetirementSpendingFromPortfolioPercentage</code>: spend a portfolio percentage with an optional floor.</li>
                </ul>
              </section>

              <section className="recipe-doc-section">
                <h3>Examples</h3>
                <div className="recipe-example-layout">
                  <div className="recipe-example-list">
                    {examples.map((example, index) => (
                      <button
                        type="button"
                        className={`recipe-example-option ${selectedExample === index ? "recipe-example-option-active" : ""}`}
                        key={example.name}
                        onClick={() => setSelectedExample(index)}
                      >
                        <strong>{example.name}</strong>
                        <span>{example.summary}</span>
                      </button>
                    ))}
                  </div>
                  <div className="recipe-example-preview">
                    <pre>{examples[selectedExample]!.json}</pre>
                    <button type="button" className="button button-secondary" onClick={() => setRecipeJson(examples[selectedExample]!.json)}>
                      Insert example
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
