---
author: Tosin Shada
pubDatetime: 2025-07-05T15:22:00Z
modDatetime: 2025-07-05T15:22:00Z
title: Is there a need to backup a distributed database?
slug: is-there-a-need-to-backup-a-distributed-database
featured: true
draft: true
tags:
  - tigerbeetle
  - distributed-systems
  - software-engineering
description: do we need to perform backups on a distributed database?
---

the short answer for me was yes. in my case, i was working on a wallet system and decided to use [tigerbeetle](https://tigerbeetle.com/)
as my financial ledger. its a very interesting solution with some well thought out features and guarantees. one of those features
is that the database can run as a cluster and ensure that a consensus is gotten before the transaction is committed.

## sidetrack

i actually stumbled on this application while working on another interesting project for all the wrong reasons. it was one of those
blockchain project that was called that just for the marketing and no one had done a deep dive to know whether or not a blockchain was
the right fit for the problem we were trying to solve.

anyways, we hit a snag in the middle of the project during one of our performance testing and realised that it was impossible to solve
the problem with a blockchain and the more we tried to find a work around the closer we were to a centralized datastore.

out of frustration, i started researching on an interesting financial ledger problem i will try to describe below

> how do you ensure real time balance on an account while also allowing thousands of transactions pass through it per second?

now this might look like an easy problem, but trust me it wasn't and i will probably write a blog post on that later. but basically it comes
down to whether you want to delay computing the balance or committing the transaction

## back to tigerbeetle

during my research, i came across tigerbeetle that claimed to be able to perform hundreds of thousands of transactions per second while ensuring
that the account balance is computed in real time.
