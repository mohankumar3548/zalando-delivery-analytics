# Zalando Delivery Doctor: results

Built for Zalando. Prepared by K Mohan Kumar.

## Key figures

- **Late deliveries:** 17.7% (1,062 of 6,000 orders)
- **Worst cell:** Erfurt Night (37% late, staffing 68% of plan)
- **Top root cause:** Stock in wrong warehouse (Largest push on late orders)
- **Late rate after fixes:** 14.0% (333,330 fewer late parcels a year)
- **Cost avoided:** €1.5M (At €4.5 per late parcel)

## Algorithm, as it ran

1. **Collect order and ops data**: 6,000 orders, 17.7% late
2. **Split the order timeline**: Average order-to-door 53 hrs
3. **Late-delivery model**: AUC 0.898; top cause Stock in wrong warehouse
4. **Root cause by site and shift**: Worst: Erfurt Night shift at 37% late
5. **Stock placement check**: 11% of orders shipped from the wrong site; 66% of those late
6. **Route optimisation**: Route 51% shorter after 2-opt
7. **Complaint text**: 508 complaints, top theme Late delivery
8. **Improvement plan**: Late rate 17.7% -> 14.0%

## Recommended actions

1. **Add 20% pickers to the Erfurt Night shift.** It runs at 68% of planned staffing, so picking runs past the carrier cut-off and parcels wait most of a day. *Impact: 37% late now*
2. **Rebalance stock for 60% of split orders.** 11% of orders ship from a far site. 66% of those are late vs 12% of others. *Impact: Weekly placement run*
3. **Move cross-border volume from Hermes to DPD.** Hermes is late on 36% of Poland and France orders. *Impact: Carrier SLA*
4. **Plan routes with 2-opt every morning.** The sample route is 51% shorter after optimisation. *Impact: -51% km*

_Generated from sample data. Figures are illustrative._
