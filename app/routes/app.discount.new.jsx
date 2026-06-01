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

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Find the deployed discount function so we can attach a discount to it.
  const fnResponse = await admin.graphql(
    `#graphql
      query DiscountFunctions {
        shopifyFunctions(first: 25) {
          nodes {
            id
            title
            apiType
          }
        }
      }`,
  );
  const fnData = (await fnResponse.json()).data;
  const functions = fnData?.shopifyFunctions?.nodes ?? [];
  const fn =
    functions.find((f) => f.apiType?.toLowerCase().includes("discount")) ??
    functions[0] ??
    null;
  const functionId = fn?.id ?? null;

  // List existing automatic app discounts backed by this function.
  const listResponse = await admin.graphql(
    `#graphql
      query AppDiscounts {
        discountNodes(first: 50) {
          nodes {
            id
            discount {
              __typename
              ... on DiscountAutomaticApp {
                title
                status
                appDiscountType {
                  functionId
                }
              }
            }
          }
        }
      }`,
  );
  const listData = (await listResponse.json()).data;
  const discounts = (listData?.discountNodes?.nodes ?? [])
    .filter((node) => node.discount?.__typename === "DiscountAutomaticApp")
    .filter(
      (node) =>
        !functionId || node.discount.appDiscountType?.functionId === functionId,
    )
    .map((node) => ({
      id: node.id,
      title: node.discount.title,
      status: node.discount.status,
    }));

  return { functionId, discounts };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");

  // --- Delete an existing automatic discount ---
  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    const response = await admin.graphql(
      `#graphql
        mutation DeleteFreeShipping($id: ID!) {
          discountAutomaticDelete(id: $id) {
            deletedAutomaticDiscountId
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { id } },
    );
    const result = (await response.json()).data.discountAutomaticDelete;
    if (result.userErrors?.length) {
      return { errors: result.userErrors };
    }
    return { deleted: true };
  }

  // --- Create a new automatic discount ---
  const functionId = String(formData.get("functionId") || "");
  const title = String(formData.get("title") || "Free shipping over $100");

  if (!functionId) {
    return {
      errors: [
        {
          message:
            "No discount function found. Deploy the app first with `shopify app deploy`, then try again.",
        },
      ],
    };
  }

  const response = await admin.graphql(
    `#graphql
      mutation CreateFreeShipping($discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $discount) {
          automaticAppDiscount {
            discountId
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        discount: {
          title,
          functionId,
          discountClasses: ["SHIPPING"],
          startsAt: new Date().toISOString(),
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: false,
          },
        },
      },
    },
  );

  const result = (await response.json()).data.discountAutomaticAppCreate;
  if (result.userErrors?.length) {
    return { errors: result.userErrors };
  }
  return { discountId: result.automaticAppDiscount.discountId };
};

export default function ManageDiscounts() {
  const { functionId, discounts } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  // Start empty; the placeholder shows an example. Titles must be unique
  // across automatic discounts.
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (actionData?.discountId) {
      shopify.toast.show("Free shipping discount created");
      setTitle("");
    } else if (actionData?.deleted) {
      shopify.toast.show("Discount deleted");
    }
  }, [actionData, shopify]);

  const errors = actionData?.errors ?? [];
  const titleTaken = discounts.some(
    (discount) =>
      discount.title.trim().toLowerCase() === title.trim().toLowerCase(),
  );
  const canCreate = Boolean(functionId) && title.trim() !== "" && !titleTaken;

  return (
    <s-page heading="Free shipping discount">
      <TitleBar title="Free shipping discount">
        <button variant="breadcrumb" onClick={() => navigate("/app")}>
          Home
        </button>
      </TitleBar>

      {errors.length > 0 && (
        <s-banner tone="critical" heading="Something went wrong">
          <s-unordered-list>
            {errors.map((error, index) => (
              <s-list-item key={index}>{error.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}

      {actionData?.discountId && (
        <s-banner tone="success" heading="Discount created">
          <s-paragraph>
            Free shipping now applies automatically when a cart subtotal is over $100.
          </s-paragraph>
        </s-banner>
      )}

      {!functionId && (
        <s-banner tone="warning" heading="No discount function deployed">
          <s-paragraph>
            Run <s-text>shopify app deploy</s-text> to deploy the free-shipping
            function, then reload this page.
          </s-paragraph>
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button
            icon="arrow-left"
            variant="tertiary"
            accessibilityLabel="Back"
            onClick={() => navigate("/app")}
          />
          <s-heading>Create discount</s-heading>
        </s-stack>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Title"
              placeholder="Free shipping over $100"
              details="Shown in the Discounts list and to customers at checkout."
              value={title}
              error={
                titleTaken
                  ? "A discount with this title already exists. Choose a different title."
                  : undefined
              }
              onChange={(event) => setTitle(event.target.value)}
            />
            <s-paragraph>
              Creates an automatic <s-text>SHIPPING</s-text> discount linked to your
              function. The $100 threshold is set inside the function.
            </s-paragraph>
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="functionId" value={functionId ?? ""} />
            <s-button
              type="submit"
              variant="primary"
              disabled={!canCreate ? "" : undefined}
              loading={isSubmitting ? "" : undefined}
            >
              Create discount
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Existing discounts">
        {discounts.length === 0 ? (
          <s-paragraph>No free shipping discounts yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {discounts.map((discount) => (
              <s-box
                key={discount.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-stack direction="block" gap="small-500">
                    <s-text fontWeight="bold">{discount.title}</s-text>
                    <s-badge tone={discount.status === "ACTIVE" ? "success" : "neutral"}>
                      {discount.status}
                    </s-badge>
                  </s-stack>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={discount.id} />
                    <s-button type="submit" tone="critical" variant="secondary">
                      Delete
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
