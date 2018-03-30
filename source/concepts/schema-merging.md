title: Schema Merging
---

<img alt="Graphic of inteconnected servers" src="/images/03 Cloud Server Network.svg" class="ux-icon" />

It's fundemental to the security model of Bunjil to provide a single public schema. With one schema,
you only need one GraphQL endpoint for your apps, one method for Authentication, and one set of policies
for Authorization.

In short, things get simpler when you have one public schema.

There's a few major use cases for merging multiple schema's into one, inluding masking, multiple upstream
GraphQL servers, and proxying third party API's.

[Learn how to mask a type with Bunjil](/guides/schema-masking.html)