import { useEffect, useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// App-reserved namespace so the app owns the definition (lets us set admin +
// storefront access). Read in Liquid as shop.metafields["$app:free_shipping"].
const NAMESPACE = "$app:free_shipping";
const KEY = "threshold";
const DEFAULT_THRESHOLD = 100;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query ShopThreshold($namespace: String!, $key: String!) {
        shop {
          id
          metafield(namespace: $namespace, key: $key) {
            value
          }
        }
      }`,
    { variables: { namespace: NAMESPACE, key: KEY } },
  );

  const { data } = await response.json();
  const value = data?.shop?.metafield?.value;
  return {
    threshold: value != null ? Number(value) : DEFAULT_THRESHOLD,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const threshold = Number(formData.get("threshold"));

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { errors: [{ message: "Enter a threshold greater than 0." }] };
  }

  // 1. Ensure the metafield definition exists (storefront-readable so the
  //    bar can read it). Ignore the "already exists" error on repeat saves.
  const defResponse = await admin.graphql(
    `#graphql
      mutation EnsureDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        definition: {
          ownerType: "SHOP",
          namespace: NAMESPACE,
          key: KEY,
          name: "Free shipping threshold",
          description:
            "Minimum cart subtotal for free shipping. Read by the discount function and the storefront bar.",
          type: "number_decimal",
          // App-reserved namespace, so we can set both admin and storefront
          // access. storefront PUBLIC_READ is what lets the theme bar read it.
          access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
        },
      },
    },
  );
  const defResult = (await defResponse.json()).data.metafieldDefinitionCreate;
  const defErrors = (defResult.userErrors ?? []).filter(
    (error) => error.code !== "TAKEN",
  );
  if (defErrors.length) {
    return { errors: defErrors };
  }

  // 2. Look up the shop id, then set the value.
  const shopResponse = await admin.graphql(
    `#graphql
      query { shop { id } }`,
  );
  const shopId = (await shopResponse.json()).data.shop.id;

  const setResponse = await admin.graphql(
    `#graphql
      mutation SetThreshold($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { value }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: NAMESPACE,
            key: KEY,
            type: "number_decimal",
            value: String(threshold),
          },
        ],
      },
    },
  );
  const setResult = (await setResponse.json()).data.metafieldsSet;
  if (setResult.userErrors?.length) {
    return { errors: setResult.userErrors };
  }

  return { saved: true, threshold };
};

export default function Settings() {
  const { threshold: initialThreshold } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  const [threshold, setThreshold] = useState(String(initialThreshold));

  useEffect(() => {
    if (actionData?.saved) {
      shopify.toast.show("Threshold saved");
    }
  }, [actionData, shopify]);

  const errors = actionData?.errors ?? [];

  return (
    <Form method="post">
      <s-page heading="Settings">
        <TitleBar title="Settings">
          <button variant="breadcrumb" onClick={() => navigate("/app")}>
            Home
          </button>
        </TitleBar>

        {errors.length > 0 && (
          <s-banner tone="critical" heading="Couldn't save">
            <s-unordered-list>
              {errors.map((error, index) => (
                <s-list-item key={index}>{error.message}</s-list-item>
              ))}
            </s-unordered-list>
          </s-banner>
        )}

        {actionData?.saved && (
          <s-banner tone="success" heading="Saved">
            <s-paragraph>
              Both the checkout discount and the storefront bar now use a $
              {actionData.threshold} threshold.
            </s-paragraph>
          </s-banner>
        )}

        <s-section heading="Free shipping threshold">
          <s-stack direction="block" gap="base">
            <s-number-field
              label="Minimum cart subtotal ($)"
              details="Stored in a shop metafield read by the discount function and the storefront bar."
              min="0"
              step="0.01"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
            <input type="hidden" name="threshold" value={threshold} />
            <s-button
              type="submit"
              variant="primary"
              loading={isSubmitting ? "" : undefined}
            >
              Save
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    </Form>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
