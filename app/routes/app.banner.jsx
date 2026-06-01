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

// Design for the simple cart-page banner. Stored in its own app-owned
// metaobject, separate from the progress-bar design and the threshold metafield.
// Theme reads it via
// shop.metaobjects["$app:free_shipping_banner"]["free-shipping-banner"].config.value
const TYPE = "$app:free_shipping_banner";
const HANDLE = "free-shipping-banner";
const FIELD = "config";
const SAVE_BAR_ID = "banner-save-bar";

const DEFAULT_BANNER = {
  backgroundColor: "#008060",
  textColor: "#ffffff",
  textSize: 14,
  padding: 10,
  message: "🚚 Free shipping on orders over [amount]!",
};

function parseBanner(value) {
  if (!value) return { ...DEFAULT_BANNER };
  try {
    return { ...DEFAULT_BANNER, ...JSON.parse(value) };
  } catch {
    return { ...DEFAULT_BANNER };
  }
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query GetBanner($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          field(key: "${FIELD}") { value }
        }
        shop {
          metafield(namespace: "$app:free_shipping", key: "threshold") { value }
        }
      }`,
    { variables: { handle: { type: TYPE, handle: HANDLE } } },
  );

  const { data } = await response.json();
  const thresholdValue = data?.shop?.metafield?.value;
  return {
    banner: parseBanner(data?.metaobjectByHandle?.field?.value),
    threshold: thresholdValue != null ? Number(thresholdValue) : 100,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const banner = {
    backgroundColor: String(formData.get("backgroundColor") || DEFAULT_BANNER.backgroundColor),
    textColor: String(formData.get("textColor") || DEFAULT_BANNER.textColor),
    textSize: Number(formData.get("textSize")) || DEFAULT_BANNER.textSize,
    padding: Number(formData.get("padding")) || DEFAULT_BANNER.padding,
    message: String(formData.get("message") || DEFAULT_BANNER.message),
  };

  // 1. Ensure the metaobject definition (storefront-readable). Ignore "exists".
  const defResponse = await admin.graphql(
    `#graphql
      mutation EnsureBannerDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        definition: {
          type: TYPE,
          name: "Free shipping banner design",
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

  // 2. Upsert the single banner design metaobject.
  const upsertResponse = await admin.graphql(
    `#graphql
      mutation UpsertBanner($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { handle }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        handle: { type: TYPE, handle: HANDLE },
        metaobject: { fields: [{ key: FIELD, value: JSON.stringify(banner) }] },
      },
    },
  );
  const upsertResult = (await upsertResponse.json()).data.metaobjectUpsert;
  if (upsertResult.userErrors?.length) {
    return { errors: upsertResult.userErrors };
  }

  return { saved: true };
};

export default function Banner() {
  const { banner: initial, threshold } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  const [banner, setBanner] = useState(initial);
  const [baseline, setBaseline] = useState(initial);

  const dirty = JSON.stringify(banner) !== JSON.stringify(baseline);

  const bannerRef = useRef(banner);
  bannerRef.current = banner;

  useEffect(() => {
    if (dirty) {
      shopify.saveBar.show(SAVE_BAR_ID);
    } else {
      shopify.saveBar.hide(SAVE_BAR_ID);
    }
  }, [dirty, shopify]);

  useEffect(() => {
    if (actionData?.saved) {
      shopify.toast.show("Banner saved");
      setBaseline(bannerRef.current);
    }
  }, [actionData, shopify]);

  const set = (key) => (event) =>
    setBanner((current) => ({ ...current, [key]: event.target.value }));

  const handleSave = () => {
    const formData = new FormData();
    Object.entries(banner).forEach(([key, value]) => {
      formData.set(key, String(value));
    });
    submit(formData, { method: "post" });
  };

  const handleDiscard = () => setBanner(baseline);

  const message = banner.message.replace("[amount]", `$${threshold}`);
  const errors = actionData?.errors ?? [];

  return (
    <s-page heading="Free shipping banner design (all pages)">
      <TitleBar title="Free shipping banner design (all pages)">
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
        <s-banner tone="critical" heading="Couldn't save the banner">
          <s-unordered-list>
            {errors.map((error, index) => (
              <s-list-item key={index}>{error.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      <s-section heading="Preview">
        <s-paragraph>Preview uses your current threshold (${threshold}) from Settings, shown wherever [amount] appears in the message.</s-paragraph>
        <div
          style={{
            margin: "1rem 0",
            padding: `${banner.padding}px 16px`,
            background: banner.backgroundColor,
            color: banner.textColor,
            fontSize: `${banner.textSize}px`,
            fontWeight: 600,
            textAlign: "center",
            borderRadius: "4px",
          }}
        >
          {message}
        </div>
      </s-section>

      <s-section heading="Style">
        <s-stack direction="block" gap="base">
          <s-color-field label="Background" value={banner.backgroundColor} onChange={set("backgroundColor")} />
          <s-color-field label="Text" value={banner.textColor} onChange={set("textColor")} />
          <s-number-field label="Text size (px)" min="8" max="40" value={String(banner.textSize)} onChange={set("textSize")} />
          <s-number-field label="Padding (px)" min="0" max="40" value={String(banner.padding)} onChange={set("padding")} />
        </s-stack>
      </s-section>

      <s-section heading="Message">
        <s-text-field
          label="Banner message"
          details="Use [amount] where the threshold should appear."
          value={banner.message}
          onChange={set("message")}
        />
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
