# Ti ADP (Apple Developer Portal)

Uses installrapp.com to create and manage Provisioning Profiles in the Apple Developer Portal.  This allows you to install your Titanium apps directly to devices and create AdHoc builds without ever logging into the Apple Developer Portal.

Turns this:

```shell
ti build device -p ios --developer-name "Jeff Bonnes (1234ABCDEF)" --pp-uuid 2fe75116-4c12-4632-8f2f-6410384abb57
```

Into this:

```shell
ti build --auto-device
```

and

```shell
ti build --target dist-adhoc -p ios --distribution-name "Geeks Inc Pty Ltd (7AG52ANMT2)" --pp-uuid 0b030407-a1ba-4a31-8365-1bfd23871b02 --output-dir ~\Desktop
```

Into this:

```shell
ti build --auto-adhoc
```

## Setup
Need to use your Installr API Key and enter your Apple Developer Portal details (including team). We use everything else from your tiapp.xml to create the App Identifer and Profiles (Development, AdHoc, and Store) and install them into your KeyChain.

You can setup your Installr key in your .bash_profile:

```shell
export INSTALLR_API_TOKEN=myInstallrAPiToken
```

or in your tiapp.xml
```shell
<property name="installr.api_token">ENTER_INSTALLR_API_TOKEN_HERE</property>
```
tiapp.xml takes presedence and will override the global setting so you can have per app API tokens.

# How it works

tiadp has two parts:

1. a script manages your Installr and Apple Developer Portal details.
2. A CLI Plug-in

## tiadp command
To manage our Apple Developer Portal details, use the tiadp command:

```shell
usage: tiadp <command> <adp login email/username>
```

available commands:

1. `tiadp add` - add a new login
2. `tiadp list` - shows all adp logins (email, masked password, team) saved
3. `tiadp remove` - removes a login
4. `tiadp change` - change the password for an entry

## cli plugin
To use the plug-in, just use the flags --auto-device or --auto-adhoc after `ti build`.  You will be prompted for all details. The plug-in will even create Application Identifiers and Provisioning Profiles for you. You must have a certificate installed on your machine that matches the certificate in the Apple Developer Portal.

The CLI plug-in hooks into the CLI at the `cli:go` step, which is before the CLI arguments are parsed.

Note: Once you make your choices for the first time, they are cached in a ~\tiapd.json file.  This makes is quicker as the plug-in doesn't need to query Installr everytime you build. If you would like to get prompted again, use the `--force` flag.

```shell
ti build --auto-device --force
```

# Other cools stuff
Use the [ti-installr-hook](https://github.com/amitkothari/ti-installr-hook) an uploading a IPA to installrapp.com is a easy as `ti build --auto-adhoc --installr`

# Changelog
