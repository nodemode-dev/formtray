# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| 0.9.x (latest release) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormTray runs on your own machine and never touches the network, so the things that
matter most are the ways something outside it could get in:

- **Opening apps**: getting FormTray to launch a program that is not a Form app it
  found, for example through a crafted FormPortal install record or app bundle.
- **Requests to the running FormTray**: a second `formtray` start, or another program,
  making it do more than show a view or its settings.
- **Icons**: reading a file outside FormTray's own icon cache through the `appicon`
  address the window uses.
- **Files**: writing anywhere other than FormTray's own preferences, or writing to
  FormPortal's files, which it only reads.
- **The network**: anything that makes FormTray reach the network.

Bugs that need someone to already control your machine, or to run a modified build
of FormTray, are ordinary bugs: please open an issue for those.
