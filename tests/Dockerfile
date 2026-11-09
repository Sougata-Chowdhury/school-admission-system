FROM mcr.microsoft.com/dotnet/sdk:8.0 AS test

WORKDIR /src

COPY backend/ backend/
COPY tests/ tests/

RUN dotnet restore tests/SchoolAdmissionApi.Tests.csproj

CMD ["dotnet", "test", "tests/SchoolAdmissionApi.Tests.csproj", "--no-restore", "--logger", "console;verbosity=normal"]
