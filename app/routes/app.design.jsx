import { useEffect, useRef, useState } from "react";
import {
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { SaveBar, TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// The design lives as a JSON blob in an app-owned metaobject (separate from the
// threshold metafield). The theme bar reads it via
// shop.metaobjects["$app:free_shipping_bar"]["free-shipping-bar"].config.value
const TYPE = "$app:free_shipping_bar";
const HANDLE = "free-shipping-bar";
const FIELD = "config";
const SAVE_BAR_ID = "design-save-bar";

const DEFAULT_DESIGN = {
  backgroundColor: "#f1f8f5",
  textColor: "#202223",
  barColor: "#008060",
  trackColor: "#e3e3e3",
  textSize: 14,
  padding: 12,
  borderRadius: 8,
  progressMessage: "You're [amount] away from free shipping 🚚",
  successMessage: "🎉 You've unlocked free shipping!",
};

function parseDesign(value) {
  if (!value) return { ...DEFAULT_DESIGN };
  try {
    return { ...DEFAULT_DESIGN, ...JSON.parse(value) };
  } catch {
    return { ...DEFAULT_DESIGN };
  }
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query GetDesign($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          field(key: "${FIELD}") { value }
        }
      }`,
    { variables: { handle: { type: TYPE, handle: HANDLE } } },
  );

  const { data } = await response.json();
  return { design: parseDesign(data?.metaobjectByHandle?.field?.value) };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const design = {
    backgroundColor: String(formData.get("backgroundColor") || DEFAULT_DESIGN.backgroundColor),
    textColor: String(formData.get("textColor") || DEFAULT_DESIGN.textColor),
    barColor: String(formData.get("barColor") || DEFAULT_DESIGN.barColor),
    trackColor: String(formData.get("trackColor") || DEFAULT_DESIGN.trackColor),
    textSize: Number(formData.get("textSize")) || DEFAULT_DESIGN.textSize,
    padding: Number(formData.get("padding")) || DEFAULT_DESIGN.padding,
    borderRadius: Number(formData.get("borderRadius")) || DEFAULT_DESIGN.borderRadius,
    progressMessage: String(formData.get("progressMessage") || DEFAULT_DESIGN.progressMessage),
    successMessage: String(formData.get("successMessage") || DEFAULT_DESIGN.successMessage),
  };

  // 1. Ensure the metaobject definition exists (storefront-readable so the
  //    theme bar can read it). Ignore "already exists" on repeat saves.
  const defResponse = await admin.graphql(
    `#graphql
      mutation EnsureDesignDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        definition: {
          type: TYPE,
          name: "Free shipping bar design",
          access: { storefront: "PUBLIC_READ" },
          fieldDefinitions: [{ key: FIELD, name: "Config", type: "json" }],
        },
      },
    },
  );
  const defResult = (await defResponse.json()).data.metaobjectDefinitionCreate;
  const defErrors = (defResult.userErrors ?? []).filter(
    (error) => error.code !== "TAKEN" && error.code !== "TYPE_ALREADY_EXISTS",
  );
  if (defErrors.length) {
    return { errors: defErrors };
  }

  // 2. Create or update the single design metaobject.
  const upsertResponse = await admin.graphql(
    `#graphql
      mutation UpsertDesign($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { handle }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        handle: { type: TYPE, handle: HANDLE },
        metaobject: { fields: [{ key: FIELD, value: JSON.stringify(design) }] },
      },
    },
  );
  const upsertResult = (await upsertResponse.json()).data.metaobjectUpsert;
  if (upsertResult.userErrors?.length) {
    return { errors: upsertResult.userErrors };
  }

  return { saved: true };
};

export default function Design() {
  const { design: initial } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  const [design, setDesign] = useState(initial);
  // `baseline` is the last-saved state; the save bar shows while design != baseline.
  const [baseline, setBaseline] = useState(initial);
  const [cartValue, setCartValue] = useState(60);
  const threshold = 100; // preview only — real value comes from the metafield

  const dirty = JSON.stringify(design) !== JSON.stringify(baseline);

  // Keep a ref to the current design so the save effect doesn't depend on it.
  const designRef = useRef(design);
  designRef.current = design;

  // Show/hide the App Bridge contextual save bar based on unsaved changes.
  useEffect(() => {
    if (dirty) {
      shopify.saveBar.show(SAVE_BAR_ID);
    } else {
      shopify.saveBar.hide(SAVE_BAR_ID);
    }
  }, [dirty, shopify]);

  // After a successful save, the current design becomes the new clean baseline.
  useEffect(() => {
    if (actionData?.saved) {
      shopify.toast.show("Design saved");
      setBaseline(designRef.current);
    }
  }, [actionData, shopify]);

  const set = (key) => (event) =>
    setDesign((current) => ({ ...current, [key]: event.target.value }));

  // Save submits ALL design fields as form data to the action.
  const handleSave = () => {
    const formData = new FormData();
    Object.entries(design).forEach(([key, value]) => {
      formData.set(key, String(value));
    });
    submit(formData, { method: "post" });
  };

  const handleDiscard = () => setDesign(baseline);

  const remaining = Math.max(threshold - cartValue, 0);
  const percent = Math.min((cartValue / threshold) * 100, 100);
  const message =
    remaining <= 0
      ? design.successMessage
      : design.progressMessage.replace("[amount]", `$${remaining.toFixed(2)}`);

  const errors = actionData?.errors ?? [];

  return (
    <s-page heading="Free shipping bar design (cart page)">
      <TitleBar title="Free shipping bar design (cart page)">
        <button variant="breadcrumb" onClick={() => navigate("/app")}>
          Home
        </button>
      </TitleBar>

      <SaveBar id={SAVE_BAR_ID}>
        <button
          variant="primary"
          onClick={handleSave}
          loading={isSubmitting ? "" : undefined}
        />
        <button onClick={handleDiscard} disabled={isSubmitting ? "" : undefined} />
      </SaveBar>

      {errors.length > 0 && (
        <s-banner tone="critical" heading="Couldn't save the design">
          <s-unordered-list>
            {errors.map((error, index) => (
              <s-list-item key={index}>{error.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section heading="Preview">
        <s-paragraph>
          Preview uses a $100 example threshold. The live bar always uses your
          real threshold from Settings.
        </s-paragraph>
        <div
          style={{
            margin: "1rem 0",
            padding: `${design.padding}px`,
            borderRadius: `${design.borderRadius}px`,
            background: design.backgroundColor,
            color: design.textColor,
            fontSize: `${design.textSize}px`,
          }}
        >
          <p style={{ margin: "0 0 0.5rem", textAlign: "center" }}>{message}</p>
          <div
            style={{
              width: "100%",
              height: "10px",
              borderRadius: "999px",
              background: design.trackColor,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                borderRadius: "999px",
                background: design.barColor,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
        <s-number-field
          label="Example cart value ($)"
          min="0"
          value={String(cartValue)}
          onChange={(event) => setCartValue(Number(event.target.value) || 0)}
        />
      </s-section>

      <s-section heading="Colors">
        <s-stack direction="block" gap="base">
          <s-color-field label="Background" value={design.backgroundColor} onChange={set("backgroundColor")} />
          <s-color-field label="Text" value={design.textColor} onChange={set("textColor")} />
          <s-color-field label="Progress fill" value={design.barColor} onChange={set("barColor")} />
          <s-color-field label="Track" value={design.trackColor} onChange={set("trackColor")} />
        </s-stack>
      </s-section>

      <s-section heading="Spacing & text">
        <s-stack direction="block" gap="base">
          <s-number-field label="Text size (px)" min="8" max="40" value={String(design.textSize)} onChange={set("textSize")} />
          <s-number-field label="Padding (px)" min="0" max="64" value={String(design.padding)} onChange={set("padding")} />
          <s-number-field label="Corner radius (px)" min="0" max="40" value={String(design.borderRadius)} onChange={set("borderRadius")} />
        </s-stack>
      </s-section>

      <s-section heading="Messages">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Progress message"
            details="Use [amount] where the remaining amount should appear."
            value={design.progressMessage}
            onChange={set("progressMessage")}
          />
          <s-text-field label="Unlocked message" value={design.successMessage} onChange={set("successMessage")} />
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
