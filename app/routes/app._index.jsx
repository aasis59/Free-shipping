import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};



export default function Index() {
 
  return (
    <s-page heading="Free Shipping">
        <p> This is a demo app to show how to use React Router with Shopify. It includes a free shipping promotion that can be applied to any order. To apply the promotion, add any product to your cart and then click the "Apply Free Shipping" button on the cart page.</p> 
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
