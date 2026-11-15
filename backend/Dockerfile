# Builds the Small Mart API into a small image. Build context: the backend/ folder.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/SmallMart.Api/SmallMart.Api.csproj src/SmallMart.Api/
RUN dotnet restore src/SmallMart.Api/SmallMart.Api.csproj
COPY src/SmallMart.Api/ src/SmallMart.Api/
RUN dotnet publish src/SmallMart.Api/SmallMart.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# The host tells us which port to listen on in PORT (Render uses 10000); 8080 otherwise.
# The host's proxy terminates HTTPS, so trust the X-Forwarded-* headers it sends.
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    DOTNET_gcServer=0 \
    DOTNET_EnableDiagnostics=0
# Folder for uploaded pictures when they are kept on disk (a volume is mounted here).
RUN mkdir -p /data && chown $APP_UID /data
USER $APP_UID
ENTRYPOINT ["/bin/sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} exec dotnet SmallMart.Api.dll"]
