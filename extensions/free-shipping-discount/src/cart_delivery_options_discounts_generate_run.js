import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
} from "../generated/api";

/**
  * @typedef {import("../generated/api").DeliveryInput} RunInput
  * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
  */

// Default minimum cart subtotal for free shipping, used when the merchant
// hasn't set a threshold in the shop metafield.
const DEFAULT_FREE_SHIPPING_THRESHOLD = 100;

/**
 * Reads the threshold from the shop metafield ($app:free_shipping/threshold),
 * which the app's Settings page writes, falling back to the default.
 * @param {RunInput} input
 * @returns {number}
 */
function getThreshold(input) {
  const threshold = parseFloat(input.shop?.metafield?.value);
  return Number.isFinite(threshold) && threshold > 0
    ? threshold
    : DEFAULT_FREE_SHIPPING_THRESHOLD;
}

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    return {operations: []};
  }

  const hasShippingDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Shipping,
  );

  if (!hasShippingDiscountClass) {
    return {operations: []};
  }

  const subtotal = parseFloat(input.cart.cost.subtotalAmount.amount);
  if (!(subtotal > getThreshold(input))) {
    return {operations: []};
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: "FREE DELIVERY",
              targets: [
                {
                  deliveryGroup: {
                    id: firstDeliveryGroup.id,
                  },
                },
              ],
              value: {
                percentage: {
                  value: 100,
                },
              },
            },
          ],
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}