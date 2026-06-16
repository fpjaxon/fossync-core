# fossync Cloud Privacy Policy

**Effective date:** June 15, 2026

This Privacy Policy explains what information fossync Cloud collects, how it is
used, and how it is handled.

fossync Cloud is operated by **Floatpoint, LLC** and provides the backend service
for the fossync browser extension. fossync lets people watch content together by
synchronizing playback controls (such as play, pause, and seek), plus lightweight
text chat and emoji reactions. fossync Cloud
does **not** stream, store, proxy, record, or redistribute any video or media
content. Participants stream media directly from the original website or service
they are viewing.

Our goal is simple: collect as little information as possible. The fossync browser
extension itself does not collect any data — everything it needs (such as your
display name) is stored locally in your browser. Floatpoint, LLC does not store
data about you or your use of fossync Cloud.

## What We Collect

### Information we do not collect

We do **not** collect:

* Names
* Email addresses
* Phone numbers
* Postal addresses
* Payment information
* Government-issued identifiers
* Video viewing history
* Playback history
* Analytics data
* Advertising identifiers
* Cross-site tracking data
* Behavioral profiles
* User accounts tied to personal information

We do not use advertising, third-party analytics, tracking pixels, or similar
tracking technologies. We do not use cookies for advertising or tracking purposes.

### The browser extension

The fossync browser extension does not collect or transmit your personal data. Any
settings it needs — including your display name — are stored locally in your
browser's extension storage and stay on your device. The extension only sends the
information necessary to operate a watch party (see "Room data" below) to the rooms
you actively join, and it only connects to fossync Cloud on pages where you start
or join a room.

### Display names

Participants use a display name within a room. Display names are pseudonyms chosen
by users or generated randomly by default. They are stored locally in the browser
extension and are not maintained as user profiles on our servers.

### Room data

To provide synchronization features, fossync Cloud temporarily processes, in real
time:

* Room identifiers
* Playback control events (such as play, pause, and seek actions)
* Participant display names
* Chat messages and emoji reactions
* The URL of the page the room is currently watching

This information exists only for the operation of an active room and is relayed in
real time to the other participants in that room.

## How Information Is Used

fossync Cloud uses the limited information it receives solely to operate the
service. Specifically:

* Playback control events are relayed to other participants in the same room.
* Chat messages and reactions are relayed to other participants in the same room.
* Display names are shown to other participants in the same room.
* Room state (including the current content URL) is maintained temporarily so
  participants remain synchronized and on the same content.

We do not use this information for advertising, profiling, analytics, marketing, or
user tracking.

## Real-Time and Ephemeral by Design

Room state is designed to be temporary. fossync Cloud is built on Cloudflare
Durable Objects, and the participant list and display names exist only in memory
for the duration of each live connection — they are discarded as soon as a
participant disconnects, and are never written to persistent storage.

To keep participants synchronized while a room is active, fossync Cloud maintains a
small room record in Durable Object storage containing only:

* the current playback position,
* whether playback is paused,
* the playback rate,
* the room's control mode (who is allowed to control playback),
* the URL of the page the room is currently watching, and
* a randomly generated identifier for the current host.

This record contains no names, no messages, no viewing history, and no information
that identifies any person. It exists only while the room is active and is
**automatically deleted when the last participant leaves the room**.

Chat messages and reactions are relayed live between participants and are never
written to storage. We do not retain playback history. We do not maintain logs of
room activity or message contents. After a room ends, there is no room data left
for us to keep.

## Branded Share Links

The **official fossync extension does not create "branded" share links** (links of
the form `fossync.cloud/j/…`). An official invite is always the page you are
watching with the room code added to it, so anyone you send it to can see exactly
where it leads before opening it.

Branded links are an opt-in feature of **custom, self-built** copies of the
extension only. By design they carry the destination inside the link's *fragment*,
which browsers never send to a server — so the relay that redirects the link does
not receive the destination in its request logs, and no destination is stored
anywhere. Even so, the page that performs the redirect is served by a relay: if you
use a relay you do not operate, that relay's redirect page runs in your guests'
browsers and could read the destination they are opening. The official extension
refuses to point branded links at a relay other than the one you trust, which is
why the feature is not part of the official build at all.

## Planned Features

### Anonymous accounts

We may introduce an optional authentication system in the future. If implemented,
our design goal is to use anonymous, randomly generated account numbers similar to
the approach used by Mullvad VPN. These identifiers would not require names, email
addresses, or other personal information. If that feature is introduced, this
Privacy Policy will be updated before it becomes available.

## Information Shared With Other Participants

When you join a room, the following information is shared with the other
participants in that same room:

* Your display name
* Your playback control actions (including changing the episode/page)
* Your chat messages and emoji reactions

This sharing is necessary for the watch-party experience to function. Participants
in a room can see information that other participants choose to send within that
room.

## Third Parties and Service Providers

fossync Cloud is built on Cloudflare infrastructure, including Cloudflare Workers
and Cloudflare Durable Objects.

Cloudflare acts as a service provider (processor) that helps deliver, secure, and
operate the service. As part of providing network infrastructure, Cloudflare may
process connection-related information such as IP addresses and network metadata
for routing, security, abuse prevention, reliability, and DDoS protection. This
processing is performed by Cloudflare according to its own policies and operational
requirements.

Floatpoint, LLC does not use this information for analytics, advertising,
profiling, or user tracking.

For more information, see:

* Cloudflare Privacy Policy: https://www.cloudflare.com/privacypolicy/
* Cloudflare Subprocessors: https://www.cloudflare.com/subprocessors/

## Data Retention and Deletion

Data handled by fossync Cloud is temporary and disappears automatically when a room
ends. Because synchronization data is deleted when a room empties and participant
information is never persisted, there is generally nothing for us to delete after a
room has closed.

## Data Security

We use reasonable technical and organizational measures to protect the service and
the limited information it processes. No internet service can guarantee absolute
security, but we intentionally minimize data collection and retention to reduce
privacy risk.

## International Users

Cloudflare operates a global network. As a result, information necessary to provide
the service may be processed in multiple countries through Cloudflare's
infrastructure. Any such processing is performed by Cloudflare as part of operating
its global edge network and related services.

## Children's Privacy

fossync Cloud is not directed to children under the age of 13. We do not knowingly
collect personal information from children. Because the service is designed not to
collect personal information or require registration, we generally have no way to
identify the age of participants. If you believe a child has provided personal
information through the service, please contact us and we will review the situation.

## Your Rights and Contact Information

Because fossync Cloud is designed to collect and retain very little information, we
may not possess data that can be associated with a particular individual.

If you have privacy questions, concerns, or requests, contact us at:

**privacy@floatpoint.net**

Operator:

**Floatpoint, LLC**

Depending on your location, you may have legal rights relating to personal
information under applicable privacy laws.

## Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we
will update the Effective Date above and publish the revised policy through fossync
Cloud or related project websites. Continued use of the service after an updated
policy becomes effective constitutes acceptance of the revised policy.
