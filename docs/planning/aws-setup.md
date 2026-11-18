# AWS account setup

Nov 17, 2026 · Dan Vu

About 45 minutes, done once. It ends with a locked-down account, budget alarms, and up to $200 in free credits. Nothing here deploys DisasterDeck yet; the infrastructure code comes after this is done.

## Before you start

- A new email address only for this account, such as a Gmail like `disasterdeck.aws@…`. This becomes the root login, so don't use an IU email.
- A phone (for verification and MFA) and a card. The card is required even on the free plan.
- An authenticator app or a passkey.

## Steps

1. **Create the account.** Go to aws.amazon.com and choose Create an AWS Account. Use the new email, name the account `disasterdeck`, and choose **Individual**; switch to a business account once the company exists. New customers get $100 in credits at sign-up and can earn up to $100 more by trying a few core services ([AWS](https://aws.amazon.com/free/faqs/)).
2. **Pick the Free plan.** It never charges you until you upgrade, and it ends after 6 months or when the credits run out ([AWS](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan)). Some enterprise services are blocked on it. If Fargate or the load balancer turns out to be one of them, upgrade to Paid then; the credits carry over.
3. **Lock the root login.** Turn on MFA for root right away (Security credentials, then Assign MFA device). After today, root is only for billing and emergencies.
4. **Make an everyday admin login.** Open IAM Identity Center, enable it, and create a user in an `Admins` group with AdministratorAccess. Turn on MFA for that user too. Sign in through the Identity Center portal from now on.
5. **Set budget alarms.** In Billing, open Budgets and create a monthly cost budget with email alerts at $25 and $100. Also turn on Free Tier usage alerts.
6. **Pick one region and stay in it:** `us-east-2` (Ohio). Prices for the services in [Costs](costs.md) are basically the same as us-east-1.
7. **Turn on CloudTrail.** Create one trail that logs every region to an S3 bucket. Management events on the first trail are free, and it's the audit log agencies will ask about.
8. **Record three things:** the 12-digit account ID, the region, and confirmation that MFA is on. Never share passwords, access keys or the root email password.

## Free credits on top

- **AWS Activate Founders:** $1,000 in credits for self-funded startups, and some can get up to $5,000 over time ([AWS](https://aws.amazon.com/aws-startups/learn/applying-for-aws-activate-credits-a-step-by-step-guide)). It needs a working company website, so apply once `disasterdeck.us` shows a real landing page.

## Later, not now

- **GovCloud.** A separate account you request from your standard one. It needs US-person vetting and only matters once an agency requires it.
- **GitHub Actions to AWS.** Set up with a short-lived login (OIDC), so no permanent AWS keys ever sit in GitHub.

## Don't

- Create access keys for root or your admin user.
- Paste any AWS key into `.env` files, Slack or chat. Secrets go in AWS Secrets Manager.
- Commit anything from `~/.aws/`.
