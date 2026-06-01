import { useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const navigate = useNavigate();

  return (
    <s-page heading="Free Shipping">
      <s-section heading="Get started">
        <s-paragraph>
          Give customers free shipping when their cart subtotal is over $100, and
          show a progress bar in your storefront that nudges them toward it.
        </s-paragraph>
      </s-section>

      <s-section heading="1. Free shipping discount">
        <s-paragraph>
          Create the automatic discount powered by your Shopify Function. It
          applies free shipping at checkout whenever a cart subtotal goes over $100.
        </s-paragraph>
        <s-button variant="primary" onClick={() => navigate("/app/discount/new")}>
          Create discount
        </s-button>
      </s-section>

      <s-section heading="Threshold">
        <s-paragraph>
          Set the dollar amount for free shipping once. It&apos;s shared by the
          checkout discount and the storefront bar.
        </s-paragraph>
        <s-button onClick={() => navigate("/app/settings")}>
          Edit threshold
        </s-button>
      </s-section>

      <s-section heading="Bar design — cart page">
        <s-paragraph>
          The progress bar shown on the <s-text fontWeight="bold">cart page</s-text>
          (below the cart title). Customize its colors, spacing, text size, and
          messages with a live preview.
        </s-paragraph>
        <s-button onClick={() => navigate("/app/design")}>
          Design the cart bar
        </s-button>
      </s-section>

      <s-section heading="Banner design — all pages">
        <s-paragraph>
          The simple text banner you can show on <s-text fontWeight="bold">any or all
          pages</s-text> (add it to a site-wide section). Customize its colors,
          text, and message with a live preview.
        </s-paragraph>
        <s-button onClick={() => navigate("/app/banner")}>
          Design the banner
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
