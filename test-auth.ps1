# Quick Auth Testing Script for Windows PowerShell

$BaseUrl = "http://localhost:3000/api"

Write-Host "Testing Delivery App Authentication" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Send OTP
Write-Host "Test 1: Sending OTP to customer..." -ForegroundColor Yellow

$otpBody = @{
    phone = "+21612345678"
    role = "CUSTOMER"
} | ConvertTo-Json

try {
    $otpResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/user/send-otp" -Method Post -ContentType "application/json" -Body $otpBody
    Write-Host ($otpResponse | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    $otp = $otpResponse.otp
    
    if (-not $otp) {
        Write-Host "Failed to get OTP" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "OTP received: $otp" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error sending OTP: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Verify OTP
Write-Host "Test 2: Verifying OTP..." -ForegroundColor Yellow

$verifyBody = @{
    phone = "+21612345678"
    role = "CUSTOMER"
    otp = $otp
} | ConvertTo-Json

try {
    $tokenResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/user/verify-otp" -Method Post -ContentType "application/json" -Body $verifyBody
    Write-Host ($tokenResponse | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    $accessToken = $tokenResponse.accessToken
    
    if (-not $accessToken) {
        Write-Host "Failed to get access token" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Access token received" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error verifying OTP: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Get User Info
Write-Host "Test 3: Getting user info..." -ForegroundColor Yellow

try {
    $headers = @{ Authorization = "Bearer $accessToken" }
    $userInfo = Invoke-RestMethod -Uri "$BaseUrl/auth/user/me" -Method Post -Headers $headers
    Write-Host ($userInfo | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    
    if ($userInfo.id) {
        Write-Host "User info retrieved successfully" -ForegroundColor Green
    } else {
        Write-Host "Failed to get user info" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
} catch {
    Write-Host "Error getting user info: $_" -ForegroundColor Red
    exit 1
}

# Test 4: Complete Profile
Write-Host "Test 4: Completing user profile..." -ForegroundColor Yellow

$profileBody = @{
    firstName = "Ahmed"
    secondName = "Ben Ali"
    myEmail = "ahmed.test@example.com"
} | ConvertTo-Json

try {
    $headers = @{ Authorization = "Bearer $accessToken" }
    $profileResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/user/complete-profile" -Method Patch -Headers $headers -ContentType "application/json" -Body $profileBody
    Write-Host ($profileResponse | ConvertTo-Json -Depth 10) -ForegroundColor Gray
    
    if ($profileResponse.firstName) {
        Write-Host "Profile updated successfully" -ForegroundColor Green
    } else {
        Write-Host "Failed to update profile" -ForegroundColor Red
    }
    Write-Host ""
} catch {
    Write-Host "Error updating profile: $_" -ForegroundColor Red
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All tests passed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your access token:" -ForegroundColor Cyan
Write-Host $accessToken -ForegroundColor White
Write-Host ""
Write-Host "Use this token in Postman Authorization header:" -ForegroundColor Yellow
Write-Host "Bearer <token>" -ForegroundColor White
